"""Sales domain models: SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem."""

from sqlalchemy import (
    Column, Integer, String, Date, DateTime, ForeignKey, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class SalesOrder(Base):
    """
    State machine:
      CREATED → CONFIRMED → ALLOCATED → DELIVERED → CLOSED
                                ↘ CANCELLED (from CREATED/CONFIRMED/ALLOCATED)
    """
    __tablename__ = "sales_orders"
    __table_args__ = (
        Index("ix_so_status", "status"),
        Index("ix_so_order_number", "order_number", unique=True),
    )

    VALID_TRANSITIONS = {
        "CREATED":   {"CONFIRMED", "CANCELLED"},
        "CONFIRMED": {"ALLOCATED", "CANCELLED"},
        "ALLOCATED": {"DELIVERED", "CANCELLED"},
        "DELIVERED": {"CLOSED"},
        "CLOSED":    set(),
        "CANCELLED": set(),
    }

    id = Column(Integer, primary_key=True)
    order_number = Column(String(50), nullable=False, unique=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    status = Column(String(20), default="CREATED")
    priority_level = Column(String(20))
    order_date = Column(Date)
    expected_delivery_date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship("SalesOrderItem", back_populates="order")
    customer = relationship("Customer", back_populates="sales_orders")
    delivery_notes = relationship("DeliveryNote", back_populates="sales_order")

    def can_transition_to(self, target: str) -> bool:
        return target in self.VALID_TRANSITIONS.get(self.status, set())


class SalesOrderItem(Base):
    __tablename__ = "sales_order_items"

    id = Column(Integer, primary_key=True)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    ordered_qty = Column(Integer, nullable=False)
    picked_qty = Column(Integer, default=0)
    bundle_id = Column(Integer, ForeignKey("bundles.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("SalesOrder", back_populates="items")


class DeliveryNote(Base):
    __tablename__ = "delivery_notes"

    id = Column(Integer, primary_key=True)
    delivery_number = Column(String(50), nullable=False, unique=True)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False)
    status = Column(String(20))
    shipped_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sales_order = relationship("SalesOrder", back_populates="delivery_notes")
    items = relationship("DeliveryNoteItem", back_populates="delivery_note")


class DeliveryNoteItem(Base):
    __tablename__ = "delivery_note_items"

    id = Column(Integer, primary_key=True)
    delivery_note_id = Column(Integer, ForeignKey("delivery_notes.id"), nullable=False)
    sales_order_item_id = Column(Integer, ForeignKey("sales_order_items.id"), nullable=False)
    shipped_qty = Column(Integer, nullable=False)

    delivery_note = relationship("DeliveryNote", back_populates="items")
    sales_order_item = relationship("SalesOrderItem")


class PickingAllocation(Base):
    __tablename__ = "picking_allocations"

    id = Column(Integer, primary_key=True)
    delivery_note_item_id = Column(Integer, ForeignKey("delivery_note_items.id", ondelete="CASCADE"), nullable=False)
    inventory_id = Column(Integer, ForeignKey("inventory.id"), nullable=False)
    quantity_allocated = Column(Integer, nullable=False)
    picking_sequence = Column(Integer, nullable=False)
    status = Column(String(20), default="PENDING")
    created_at = Column(DateTime(timezone=False), server_default=func.now())

