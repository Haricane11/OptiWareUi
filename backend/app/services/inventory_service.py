"""
Inventory Service — Production-grade batch-based stock operations.

All methods run inside DB transactions with row-level locking (SELECT FOR UPDATE)
to prevent race conditions. FEFO (First-Expire-First-Out) ordering is used for
allocation and deduction.

Invariants enforced:
  - quantity >= allocated >= 0
  - available = quantity - allocated
  - No negative stock (DB CHECK constraints + application validation)
"""

import logging
from datetime import date
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory
from app.models.receipt import Receipt, ReceiptItem
from app.models.products import Product
from app.core.exceptions import (
    InsufficientStockError,
    NegativeQuantityError,
    EntityNotFoundError,
)

logger = logging.getLogger(__name__)


class InventoryService:
    """Write-heavy inventory operations with concurrency control."""

    @staticmethod
    async def allocate_stock(
        db: AsyncSession,
        product_id: int,
        qty: int,
        warehouse_id: int,
    ) -> list[dict]:
        """
        Allocate `qty` units of a product using FEFO strategy.
        Locks matching inventory rows (FOR UPDATE) to prevent races.
        Returns list of batches that were allocated from.
        """
        if qty <= 0:
            raise NegativeQuantityError("Allocation quantity must be positive")

        # Lock ACTIVE batches for this product+warehouse, ordered by expiry (FEFO)
        stmt = (
            select(Inventory)
            .where(
                Inventory.product_id == product_id,
                Inventory.warehouse_id == warehouse_id,
                Inventory.status == "ACTIVE",
                Inventory.available > 0,
            )
            .order_by(Inventory.expiry_date.asc().nullslast())
            .with_for_update()
        )
        result = await db.execute(stmt)
        batches = result.scalars().all()

        total_available = sum(b.available for b in batches)
        if total_available < qty:
            raise InsufficientStockError(product_id, qty, total_available)

        remaining = qty
        allocated_from = []

        for batch in batches:
            if remaining <= 0:
                break

            take = min(batch.available, remaining)
            batch.allocated += take
            batch.available -= take
            remaining -= take

            allocated_from.append({
                "batch_id": batch.id,
                "batch_number": batch.batch_number,
                "allocated_qty": take,
                "expiry_date": str(batch.expiry_date) if batch.expiry_date else None,
            })

        await db.flush()
        logger.info(
            "Allocated %d units of product %d in warehouse %d from %d batches",
            qty, product_id, warehouse_id, len(allocated_from),
        )
        return allocated_from

    @staticmethod
    async def release_allocation(
        db: AsyncSession,
        product_id: int,
        qty: int,
        warehouse_id: int,
    ) -> list[dict]:
        """
        Release previously allocated stock (e.g. on order cancellation).
        Reverses allocation in LIFO order (latest expiry first) to preserve FEFO.
        """
        if qty <= 0:
            raise NegativeQuantityError("Release quantity must be positive")

        stmt = (
            select(Inventory)
            .where(
                Inventory.product_id == product_id,
                Inventory.warehouse_id == warehouse_id,
                Inventory.status == "ACTIVE",
                Inventory.allocated > 0,
            )
            .order_by(Inventory.expiry_date.desc().nullsfirst())
            .with_for_update()
        )
        result = await db.execute(stmt)
        batches = result.scalars().all()

        total_allocated = sum(b.allocated for b in batches)
        if total_allocated < qty:
            raise InsufficientStockError(product_id, qty, total_allocated)

        remaining = qty
        released_from = []

        for batch in batches:
            if remaining <= 0:
                break

            give_back = min(batch.allocated, remaining)
            batch.allocated -= give_back
            batch.available += give_back
            remaining -= give_back

            released_from.append({
                "batch_id": batch.id,
                "released_qty": give_back,
            })

        await db.flush()
        logger.info(
            "Released %d units of product %d in warehouse %d",
            qty, product_id, warehouse_id,
        )
        return released_from

    @staticmethod
    async def deduct_physical_stock(
        db: AsyncSession,
        product_id: int,
        qty: int,
        warehouse_id: int,
    ) -> list[dict]:
        """
        Physically remove stock after delivery (deducts from quantity AND allocated).
        FEFO order. Marks batches as DEPLETED when fully consumed.
        """
        if qty <= 0:
            raise NegativeQuantityError("Deduction quantity must be positive")

        stmt = (
            select(Inventory)
            .where(
                Inventory.product_id == product_id,
                Inventory.warehouse_id == warehouse_id,
                Inventory.status == "ACTIVE",
                Inventory.allocated > 0,
            )
            .order_by(Inventory.expiry_date.asc().nullslast())
            .with_for_update()
        )
        result = await db.execute(stmt)
        batches = result.scalars().all()

        total_allocated = sum(b.allocated for b in batches)
        if total_allocated < qty:
            raise InsufficientStockError(product_id, qty, total_allocated)

        remaining = qty
        deducted_from = []

        for batch in batches:
            if remaining <= 0:
                break

            take = min(batch.allocated, remaining)
            batch.quantity -= take
            batch.allocated -= take
            # available stays the same (it was already reduced during allocation)
            remaining -= take

            if batch.quantity == 0:
                batch.status = "DEPLETED"

            deducted_from.append({
                "batch_id": batch.id,
                "deducted_qty": take,
            })

        await db.flush()
        logger.info(
            "Deducted %d units of product %d in warehouse %d",
            qty, product_id, warehouse_id,
        )
        return deducted_from

    @staticmethod
    async def increase_stock_from_receipt(
        db: AsyncSession,
        receipt_id: int,
    ) -> list[dict]:
        """
        Create inventory batch rows from a receipt's items.
        Each receipt item becomes a new inventory batch.
        """
        stmt = select(Receipt).where(Receipt.id == receipt_id)
        result = await db.execute(stmt)
        receipt = result.scalar_one_or_none()
        if not receipt:
            raise EntityNotFoundError("Receipt", receipt_id)

        # Get warehouse from the PO
        from app.models.purchase import PurchaseOrder
        po_stmt = select(PurchaseOrder).where(PurchaseOrder.id == receipt.purchase_order_id)
        po_result = await db.execute(po_stmt)
        po = po_result.scalar_one_or_none()
        warehouse_id = po.warehouse_id if po else None

        item_stmt = select(ReceiptItem).where(ReceiptItem.receipt_id == receipt_id)
        item_result = await db.execute(item_stmt)
        items = item_result.scalars().all()

        created_batches = []
        today = date.today()

        for item in items:
            # Get product for weight/volume calculation
            prod_stmt = select(Product).where(Product.id == item.product_id)
            prod_result = await db.execute(prod_stmt)
            product = prod_result.scalar_one_or_none()

            unit_weight = float(product.weight) if product and product.weight else 0
            unit_volume = float(product.volume) if product and product.volume else 0

            batch = Inventory(
                product_id=item.product_id,
                shelf_id=item.assigned_shelf_id,
                warehouse_id=warehouse_id,
                batch_number=item.batch_number,
                quantity=item.received_qty,
                allocated=0,
                available=item.received_qty,
                total_volume=unit_volume * item.received_qty if unit_volume else None,
                total_weight=unit_weight * item.received_qty if unit_weight else None,
                expiry_date=item.expiry_date,
                received_date=today,
                status="ACTIVE",
            )
            db.add(batch)
            created_batches.append({
                "product_id": item.product_id,
                "batch_number": item.batch_number,
                "quantity": item.received_qty,
                "expiry_date": str(item.expiry_date) if item.expiry_date else None,
            })

        await db.flush()
        logger.info("Created %d inventory batches from receipt %d", len(created_batches), receipt_id)
        return created_batches

    @staticmethod
    async def get_available_stock(
        db: AsyncSession,
        product_id: int,
        warehouse_id: int | None = None,
    ) -> dict:
        """Aggregate available stock across batches, optionally by warehouse."""
        conditions = [
            Inventory.product_id == product_id,
            Inventory.status == "ACTIVE",
        ]
        if warehouse_id:
            conditions.append(Inventory.warehouse_id == warehouse_id)

        stmt = select(
            func.coalesce(func.sum(Inventory.quantity), 0).label("total"),
            func.coalesce(func.sum(Inventory.allocated), 0).label("allocated"),
            func.coalesce(func.sum(Inventory.available), 0).label("available"),
        ).where(*conditions)

        result = await db.execute(stmt)
        row = result.one()

        return {
            "product_id": product_id,
            "warehouse_id": warehouse_id,
            "total_quantity": int(row.total),
            "allocated_quantity": int(row.allocated),
            "available_quantity": int(row.available),
        }

    @staticmethod
    async def get_batches(
        db: AsyncSession,
        product_id: int,
        warehouse_id: int | None = None,
    ) -> list:
        """List inventory batches for a product, FEFO ordered."""
        conditions = [
            Inventory.product_id == product_id,
            Inventory.status == "ACTIVE",
        ]
        if warehouse_id:
            conditions.append(Inventory.warehouse_id == warehouse_id)

        stmt = (
            select(Inventory)
            .where(*conditions)
            .order_by(Inventory.expiry_date.asc().nullslast())
        )
        result = await db.execute(stmt)
        return result.scalars().all()