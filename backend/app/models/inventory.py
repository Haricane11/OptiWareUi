"""Batch-based Inventory model with strong invariants."""

from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Numeric, ForeignKey,
    CheckConstraint, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_inv_qty_nonneg"),
        CheckConstraint("allocated >= 0", name="ck_inv_alloc_nonneg"),
        CheckConstraint("available >= 0", name="ck_inv_avail_nonneg"),
        CheckConstraint("quantity >= allocated", name="ck_inv_qty_ge_alloc"),
        Index("ix_inv_product_wh_status", "product_id", "warehouse_id", "status"),
        Index("ix_inv_expiry", "expiry_date"),
        Index("ix_inv_shelf", "shelf_id"),
    )

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    shelf_id = Column(Integer, ForeignKey("shelves.id"))
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    batch_number = Column(String(50))
    quantity = Column(Integer, nullable=False, default=0)      # total_quantity
    allocated = Column(Integer, nullable=False, default=0)     # allocated_quantity
    available = Column(Integer, nullable=False, default=0)     # available = quantity - allocated
    total_volume = Column(Numeric(10, 3))
    total_weight = Column(Numeric(10, 2))
    expiry_date = Column(Date)
    received_date = Column(Date)
    status = Column(String(20), default="ACTIVE")  # ACTIVE, DEPLETED, EXPIRED, QUARANTINE
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="inventory_items")
    shelf = relationship("Shelf", back_populates="inventory_items")
