"""Purchase order models: PurchaseOrder, PurchaseOrderItem."""

from sqlalchemy import (
    Column, Integer, String, Date, DateTime, ForeignKey, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class PurchaseOrder(Base):
    """
    State machine:
      DRAFT → ORDERED → PARTIALLY_RECEIVED → FULLY_RECEIVED → CLOSED
                                                ↘ CANCELLED (from DRAFT/ORDERED)
    """
    __tablename__ = "purchase_orders"
    __table_args__ = (
        Index("ix_po_status", "status"),
        Index("ix_po_number", "po_number", unique=True),
    )

    VALID_TRANSITIONS = {
        "DRAFT":              {"ORDERED", "CANCELLED"},
        "ORDERED":            {"PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CANCELLED"},
        "PARTIALLY_RECEIVED": {"PARTIALLY_RECEIVED", "FULLY_RECEIVED"},
        "FULLY_RECEIVED":     {"CLOSED"},
        "CLOSED":             set(),
        "CANCELLED":          set(),
    }

    id = Column(Integer, primary_key=True)
    po_number = Column(String(50), nullable=False, unique=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    status = Column(String(30), default="DRAFT")
    expected_date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship("PurchaseOrderItem", back_populates="order")
    supplier = relationship("Supplier", back_populates="purchase_orders")
    receipts = relationship("Receipt", back_populates="purchase_order")

    def can_transition_to(self, target: str) -> bool:
        return target in self.VALID_TRANSITIONS.get(self.status, set())


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    ordered_qty = Column(Integer, nullable=False)
    received_qty = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("PurchaseOrder", back_populates="items")
