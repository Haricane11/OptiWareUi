"""
Reorder Service — Idempotent automatic reorder (Option A: triggered after deduction).

Trigger condition: SUM(available_quantity) across warehouses ≤ reorder_point
Algorithm:
  - Idempotent: checks for existing open POs first
  - Uses EOQ for order quantity
  - Supplier-linked via product.supplier_id
  - Prevents duplicate PO creation using row-level locking on reorder_policy
"""

import logging
from uuid import uuid4
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory
from app.models.products import Product
from app.models.reorder_policy import ReorderPolicy
from app.models.purchase import PurchaseOrder, PurchaseOrderItem
from app.core.exceptions import EntityNotFoundError

logger = logging.getLogger(__name__)


class ReorderService:

    @staticmethod
    async def check_and_reorder(
        db: AsyncSession,
        product_id: int,
    ) -> dict:
        """
        Check if product needs reordering and create a PO if needed.
        Idempotent: will not create duplicate POs.

        Steps:
          1. Lock reorder_policy row (prevents concurrent duplicate POs)
          2. Sum available stock across all warehouses
          3. If available <= reorder_point AND no open POs exist → create PO
        """
        # Lock the reorder policy to prevent duplicate PO creation (select only needed columns)
        policy_stmt = (
            select(
                ReorderPolicy.product_id.label("product_id"),
                ReorderPolicy.reorder_point.label("reorder_point"),
                ReorderPolicy.safety_stock.label("safety_stock"),
                ReorderPolicy.eoq.label("eoq"),
                ReorderPolicy.lead_time_days.label("lead_time_days"),
            )
            .where(ReorderPolicy.product_id == product_id)
            .with_for_update()
        )
        result = await db.execute(policy_stmt)
        policy_row = result.mappings().one_or_none()

        if not policy_row or not policy_row["reorder_point"]:
            return {
                "product_id": product_id,
                "available_stock": 0,
                "reorder_point": 0,
                "needs_reorder": False,
                "po_created": False,
                "po_id": None,
                "detail": "No reorder policy configured",
            }

        # Use static reorder_point as effective ROP
        effective_rop = policy_row["reorder_point"]

        # Get total available stock across warehouses
        stock_stmt = select(
            func.coalesce(func.sum(Inventory.available), 0)
        ).where(
            Inventory.product_id == product_id,
            Inventory.status == "ACTIVE",
        )
        stock_result = await db.execute(stock_stmt)
        available_stock = int(stock_result.scalar())

        needs_reorder = available_stock <= effective_rop

        if not needs_reorder:
            return {
                "product_id": product_id,
                "available_stock": available_stock,
                "reorder_point": effective_rop,
                "needs_reorder": False,
                "po_created": False,
                "po_id": None,
                "detail": "Stock above reorder point",
            }

        # Check for existing open POs (idempotency check)
        open_po_stmt = (
            select(func.count())
            .select_from(PurchaseOrder)
            .join(PurchaseOrderItem)
            .where(
                PurchaseOrderItem.product_id == product_id,
                PurchaseOrder.status.in_(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"]),
            )
        )
        open_po_result = await db.execute(open_po_stmt)
        open_po_count = open_po_result.scalar()

        if open_po_count > 0:
            return {
                "product_id": product_id,
                "available_stock": available_stock,
                "reorder_point": effective_rop,
                "needs_reorder": True,
                "po_created": False,
                "po_id": None,
                "detail": f"Open PO(s) already exist ({open_po_count})",
            }

        # Get product for supplier linkage
        prod_stmt = select(Product).where(Product.id == product_id)
        prod_result = await db.execute(prod_stmt)
        product = prod_result.scalar_one_or_none()
        if not product:
            raise EntityNotFoundError("Product", product_id)

        if not product.supplier_id:
            return {
                "product_id": product_id,
                "available_stock": available_stock,
                "reorder_point": effective_rop,
                "needs_reorder": True,
                "po_created": False,
                "po_id": None,
                "detail": "Product has no linked supplier",
            }

        # Determine order quantity (use EOQ if set, else reorder_point - available)
        order_qty = policy_row["eoq"] if policy_row["eoq"] and policy_row["eoq"] > 0 else max(
            effective_rop - available_stock + (policy_row["safety_stock"] or 0),
            1,
        )

        # Determine warehouse (use first warehouse that has inventory, or default to 1)
        wh_stmt = (
            select(Inventory.warehouse_id)
            .where(Inventory.product_id == product_id)
            .limit(1)
        )
        wh_result = await db.execute(wh_stmt)
        warehouse_id = wh_result.scalar() or 1

        # Create PO
        po_number = f"AUTO-{uuid4().hex[:8].upper()}"
        po = PurchaseOrder(
            po_number=po_number,
            supplier_id=product.supplier_id,
            warehouse_id=warehouse_id,
            status="DRAFT",
        )
        db.add(po)
        await db.flush()

        db.add(PurchaseOrderItem(
            purchase_order_id=po.id,
            product_id=product_id,
            ordered_qty=order_qty,
            received_qty=0,
        ))
        await db.flush()

        logger.info(
            "Auto-reorder: created PO %s for product %d (qty=%d, available=%d, ROP=%d)",
            po_number, product_id, order_qty, available_stock, effective_rop,
        )
        return {
            "product_id": product_id,
            "available_stock": available_stock,
            "reorder_point": effective_rop,
            "needs_reorder": True,
            "po_created": True,
            "po_id": po.id,
            "detail": f"Created PO {po_number} for {order_qty} units",
        }

    @staticmethod
    async def check_all_products(db: AsyncSession) -> list[dict]:
        """Run reorder check for all products that have a reorder policy."""
        stmt = select(ReorderPolicy.product_id)
        result = await db.execute(stmt)
        product_ids = [row[0] for row in result.all()]

        results = []
        for pid in product_ids:
            check = await ReorderService.check_and_reorder(db, pid)
            results.append(check)

        return results
