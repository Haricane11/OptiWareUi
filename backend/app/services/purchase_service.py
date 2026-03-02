"""
Purchase Order Service — State machine and goods receiving.

State flow: DRAFT → ORDERED → PARTIALLY_RECEIVED / FULLY_RECEIVED → CLOSED
            CANCELLED from DRAFT / ORDERED

Receiving creates a Receipt, links to PO items, and auto-transitions status
based on aggregate received quantities vs ordered quantities.
"""

import logging
from datetime import date
from uuid import uuid4
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.purchase import PurchaseOrder, PurchaseOrderItem
from app.models.receipt import Receipt, ReceiptItem
from app.services.inventory_service import InventoryService
from app.core.exceptions import (
    InvalidStateTransitionError,
    EntityNotFoundError,
    WMSError,
)

logger = logging.getLogger(__name__)


class PurchaseService:

    # ── Create ────────────────────────────────────────────────────────
    @staticmethod
    async def create_po(
        db: AsyncSession,
        po_number: str,
        supplier_id: int,
        warehouse_id: int,
        items: list[dict],
        expected_date: date | None = None,
    ) -> PurchaseOrder:
        po = PurchaseOrder(
            po_number=po_number,
            supplier_id=supplier_id,
            warehouse_id=warehouse_id,
            status="DRAFT",
            expected_date=expected_date,
        )
        db.add(po)
        await db.flush()

        for it in items:
            db.add(PurchaseOrderItem(
                purchase_order_id=po.id,
                product_id=it["product_id"],
                ordered_qty=it["ordered_qty"],
                received_qty=0,
            ))
        await db.flush()
        logger.info("Created PO %s (id=%d)", po_number, po.id)
        return po

    # ── State transitions ─────────────────────────────────────────────
    @staticmethod
    async def _get_po_locked(db: AsyncSession, po_id: int) -> PurchaseOrder:
        stmt = select(PurchaseOrder).where(PurchaseOrder.id == po_id).with_for_update()
        result = await db.execute(stmt)
        po = result.scalar_one_or_none()
        if not po:
            raise EntityNotFoundError("PurchaseOrder", po_id)
        return po

    @staticmethod
    async def submit_po(db: AsyncSession, po_id: int) -> PurchaseOrder:
        """DRAFT → ORDERED"""
        po = await PurchaseService._get_po_locked(db, po_id)
        if not po.can_transition_to("ORDERED"):
            raise InvalidStateTransitionError("PurchaseOrder", po.status, "ORDERED")
        po.status = "ORDERED"
        await db.flush()
        logger.info("PO %d submitted (ORDERED)", po_id)
        return po

    @staticmethod
    async def receive_goods(
        db: AsyncSession,
        po_id: int,
        items: list[dict],
    ) -> Receipt:
        """
        Receive goods against a PO.
        - Validates PO is in ORDERED or PARTIALLY_RECEIVED status
        - Creates Receipt + ReceiptItems
        - Updates received_qty on PO items
        - Auto-transitions PO to PARTIALLY_RECEIVED or FULLY_RECEIVED
        - Creates inventory batches
        """
        po = await PurchaseService._get_po_locked(db, po_id)

        receivable = {"ORDERED", "PARTIALLY_RECEIVED"}
        if po.status not in receivable:
            raise InvalidStateTransitionError(
                "PurchaseOrder", po.status, "PARTIALLY_RECEIVED/FULLY_RECEIVED"
            )

        # Load PO items
        po_items_stmt = (
            select(PurchaseOrderItem)
            .where(PurchaseOrderItem.purchase_order_id == po_id)
            .with_for_update()
        )
        po_items_result = await db.execute(po_items_stmt)
        po_items = {item.product_id: item for item in po_items_result.scalars().all()}

        # Create receipt
        receipt = Receipt(
            receipt_number=f"REC-{uuid4().hex[:8].upper()}",
            purchase_order_id=po_id,
            status="PENDING",
        )
        db.add(receipt)
        await db.flush()

        for recv in items:
            product_id = recv["product_id"]
            received_qty = recv["received_qty"]

            po_item = po_items.get(product_id)
            if not po_item:
                raise WMSError(
                    f"Product {product_id} is not on PO {po.po_number}"
                )

            remaining_to_receive = po_item.ordered_qty - po_item.received_qty
            if received_qty > remaining_to_receive:
                raise WMSError(
                    f"Cannot receive {received_qty} for product {product_id}: "
                    f"only {remaining_to_receive} remaining on PO"
                )

            po_item.received_qty += received_qty

            ri = ReceiptItem(
                receipt_id=receipt.id,
                product_id=product_id,
                received_qty=received_qty,
                batch_number=recv.get("batch_number"),
                expiry_date=recv.get("expiry_date"),
                measured_width=recv.get("measured_width"),
                measured_depth=recv.get("measured_depth"),
                measured_height=recv.get("measured_height"),
                measured_weight=recv.get("measured_weight"),
            )
            db.add(ri)

        await db.flush()

        # Create inventory batches from receipt
        await InventoryService.increase_stock_from_receipt(db, receipt.id)

        # Determine PO status based on aggregate received
        all_fully_received = all(
            item.received_qty >= item.ordered_qty for item in po_items.values()
        )
        if all_fully_received:
            po.status = "FULLY_RECEIVED"
        else:
            po.status = "PARTIALLY_RECEIVED"

        await db.flush()
        logger.info(
            "Received goods for PO %d → receipt %d, status now %s",
            po_id, receipt.id, po.status,
        )
        return receipt

    @staticmethod
    async def close_po(db: AsyncSession, po_id: int) -> PurchaseOrder:
        """FULLY_RECEIVED → CLOSED"""
        po = await PurchaseService._get_po_locked(db, po_id)
        if not po.can_transition_to("CLOSED"):
            raise InvalidStateTransitionError("PurchaseOrder", po.status, "CLOSED")
        po.status = "CLOSED"
        await db.flush()
        logger.info("PO %d closed", po_id)
        return po

    @staticmethod
    async def cancel_po(db: AsyncSession, po_id: int) -> PurchaseOrder:
        """DRAFT / ORDERED → CANCELLED"""
        po = await PurchaseService._get_po_locked(db, po_id)
        if not po.can_transition_to("CANCELLED"):
            raise InvalidStateTransitionError("PurchaseOrder", po.status, "CANCELLED")
        po.status = "CANCELLED"
        await db.flush()
        logger.info("PO %d cancelled", po_id)
        return po

    # ── Read ──────────────────────────────────────────────────────────
    @staticmethod
    async def get_po(db: AsyncSession, po_id: int) -> PurchaseOrder:
        stmt = select(PurchaseOrder).where(PurchaseOrder.id == po_id)
        result = await db.execute(stmt)
        po = result.scalar_one_or_none()
        if not po:
            raise EntityNotFoundError("PurchaseOrder", po_id)
        return po
