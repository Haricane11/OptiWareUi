"""Receipt models: Receipt, ReceiptItem."""

from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Numeric, ForeignKey,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(Integer, primary_key=True)
    receipt_number = Column(String(50), nullable=False, unique=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"))
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20), default="PENDING")  # PENDING, PLACED, COMPLETED
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    purchase_order = relationship("PurchaseOrder", back_populates="receipts")
    items = relationship("ReceiptItem", back_populates="receipt")


class ReceiptItem(Base):
    __tablename__ = "receipt_items"

    id = Column(Integer, primary_key=True)
    receipt_id = Column(Integer, ForeignKey("receipts.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    received_qty = Column(Integer, nullable=False)
    batch_number = Column(String(50))
    expiry_date = Column(Date)
    measured_width = Column(Numeric(10, 2))
    measured_depth = Column(Numeric(10, 2))
    measured_height = Column(Numeric(10, 2))
    measured_weight = Column(Numeric(10, 2))
    assigned_shelf_id = Column(Integer, ForeignKey("shelves.id"))
    placed_qty = Column(Integer, default=0)
    placement_status = Column(String(30), default="PENDING")  # PENDING, SUGGESTED, PLACED
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    receipt = relationship("Receipt", back_populates="items")
