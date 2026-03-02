"""
Sales Service — State machine and stock integration.

State flow: CREATED → CONFIRMED → ALLOCATED → DELIVERED → CLOSED
            (CANCELLED from CREATED / CONFIRMED / ALLOCATED)

- Allocation occurs only on CONFIRMED → ALLOCATED transition.
- Deduction occurs only on ALLOCATED → DELIVERED transition.
- Cancellation releases any held allocation.
"""

from app.models.bundle import Bundle, BundleItem, BundleSale
import logging
from datetime import date, datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orders import SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem
from app.services.inventory_service import InventoryService
from app.core.exceptions import (
    InvalidStateTransitionError,
    EntityNotFoundError,
)

logger = logging.getLogger(__name__)


class SalesService:

    # ── Create ────────────────────────────────────────────────────────
    @staticmethod
    async def create_order(
        db: AsyncSession,
        order_number: str,
        customer_id: int,
        warehouse_id: int,
        items: list[dict],
        priority_level: str | None = None,
        order_date: date | None = None,
    ) -> SalesOrder:
        order = SalesOrder(
            order_number=order_number,
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            status="CREATED",
            priority_level=priority_level,
            order_date=order_date or date.today(),
        )
        db.add(order)
        await db.flush()  # get order.id

        for it in items:        
    # ── Case 1: Normal product ─────────────────────────────
            if it.get("product_id"):
                db.add(SalesOrderItem(
                    sales_order_id=order.id,
                    product_id=it["product_id"],
                    ordered_qty=it["ordered_qty"],
                    picked_qty=0,
                ))
    # ── Case 2: Bundle product ─────────────────────────────
            elif it.get("bundle_id"):
                bundle_stmt = (
                    select(Bundle)
                    .where(Bundle.id == it["bundle_id"], Bundle.is_active == True)
                )
                result = await db.execute(bundle_stmt)
                bundle = result.scalar_one_or_none()
                
                if not bundle:
                    raise EntityNotFoundError("Bundle", it["bundle_id"])
                
                # Load bundle items
                items_stmt = select(BundleItem).where(BundleItem.bundle_id == bundle.id)
                items_result = await db.execute(items_stmt)
                bundle_items = items_result.scalars().all()
                
                bundle_qty = it["ordered_qty"]
                
                
                # Record the bundle sale
                db.add(BundleSale(
                    bundle_id=bundle.id,
                    sales_order_id=order.id,
                    quantity=bundle_qty
                ))

                for bundle_item in bundle_items:
                    db.add(SalesOrderItem(
                        sales_order_id=order.id,
                        product_id=bundle_item.product_id,
                        ordered_qty=bundle_item.quantity * bundle_qty,
                        picked_qty=0,
                    ))
            else:
                raise ValueError("Item must contain product_id or bundle_id")
        await db.flush()
        logger.info("Created sales order %s (id=%d)", order_number, order.id)
        return order

    # ── State transitions ─────────────────────────────────────────────
    @staticmethod
    async def _get_order_locked(db: AsyncSession, order_id: int) -> SalesOrder:
        stmt = select(SalesOrder).where(SalesOrder.id == order_id).with_for_update()
        result = await db.execute(stmt)
        order = result.scalar_one_or_none()
        if not order:
            raise EntityNotFoundError("SalesOrder", order_id)
        return order

    @staticmethod
    async def confirm_order(db: AsyncSession, order_id: int) -> SalesOrder:
        """CREATED → CONFIRMED"""
        order = await SalesService._get_order_locked(db, order_id)
        if not order.can_transition_to("CONFIRMED"):
            raise InvalidStateTransitionError("SalesOrder", order.status, "CONFIRMED")
        order.status = "CONFIRMED"
        await db.flush()
        logger.info("Sales order %d confirmed", order_id)
        return order

    @staticmethod
    async def allocate_order(db: AsyncSession, order_id: int) -> SalesOrder:
        """
        CONFIRMED → ALLOCATED
        Allocates stock for each line item using FEFO.
        Atomic: if any item fails, entire allocation rolls back.
        """
        order = await SalesService._get_order_locked(db, order_id)
        if not order.can_transition_to("ALLOCATED"):
            raise InvalidStateTransitionError("SalesOrder", order.status, "ALLOCATED")

        # Eagerly load items
        items_stmt = select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id)
        items_result = await db.execute(items_stmt)
        items = items_result.scalars().all()

        for item in items:
            await InventoryService.allocate_stock(
                db, item.product_id, item.ordered_qty, order.warehouse_id,
            )
            item.picked_qty = item.ordered_qty  # fully allocated

        order.status = "ALLOCATED"
        await db.flush()
        logger.info("Sales order %d allocated", order_id)
        return order

    @staticmethod
    async def deliver_order(db: AsyncSession, order_id: int) -> SalesOrder:
        """
        ALLOCATED → DELIVERED
        Physically deducts stock, creates a DeliveryNote.
        """
        order = await SalesService._get_order_locked(db, order_id)
        if not order.can_transition_to("DELIVERED"):
            raise InvalidStateTransitionError("SalesOrder", order.status, "DELIVERED")

        items_stmt = select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id)
        items_result = await db.execute(items_stmt)
        items = items_result.scalars().all()

        # Physical deduction
        for item in items:
            await InventoryService.deduct_physical_stock(
                db, item.product_id, item.picked_qty, order.warehouse_id,
            )

        # Create delivery note
        dn = DeliveryNote(
            delivery_number=f"DN-{order.order_number}",
            sales_order_id=order.id,
            status="SHIPPED",
            shipped_at=datetime.utcnow(),
        )
        db.add(dn)
        await db.flush()

        for item in items:
            db.add(DeliveryNoteItem(
                delivery_note_id=dn.id,
                sales_order_item_id=item.id,
                shipped_qty=item.picked_qty,
            ))

        order.status = "DELIVERED"
        await db.flush()
        logger.info("Sales order %d delivered (DN %d)", order_id, dn.id)
        return order

    @staticmethod
    async def close_order(db: AsyncSession, order_id: int) -> SalesOrder:
        """DELIVERED → CLOSED"""
        order = await SalesService._get_order_locked(db, order_id)
        if not order.can_transition_to("CLOSED"):
            raise InvalidStateTransitionError("SalesOrder", order.status, "CLOSED")
        order.status = "CLOSED"
        await db.flush()
        logger.info("Sales order %d closed", order_id)
        return order

    @staticmethod
    async def cancel_order(db: AsyncSession, order_id: int) -> SalesOrder:
        """Cancel from CREATED / CONFIRMED / ALLOCATED. Releases allocation if needed."""
        order = await SalesService._get_order_locked(db, order_id)
        if not order.can_transition_to("CANCELLED"):
            raise InvalidStateTransitionError("SalesOrder", order.status, "CANCELLED")

        # If allocated, release stock
        if order.status == "ALLOCATED":
            items_stmt = select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order_id)
            items_result = await db.execute(items_stmt)
            items = items_result.scalars().all()
            for item in items:
                await InventoryService.release_allocation(
                    db, item.product_id, item.picked_qty, order.warehouse_id,
                )
                item.picked_qty = 0

        order.status = "CANCELLED"
        await db.flush()
        logger.info("Sales order %d cancelled", order_id)
        return order

    # ── Read ──────────────────────────────────────────────────────────
    @staticmethod
    async def get_order(db: AsyncSession, order_id: int) -> SalesOrder:
        stmt = select(SalesOrder).where(SalesOrder.id == order_id)
        result = await db.execute(stmt)
        order = result.scalar_one_or_none()
        if not order:
            raise EntityNotFoundError("SalesOrder", order_id)
        return order
