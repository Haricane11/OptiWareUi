"""Product and ReorderPolicy models."""

from sqlalchemy import (
    Column, Integer, String, Numeric, ForeignKey, DateTime, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_product_sku", "sku", unique=True),
    )

    id = Column(Integer, primary_key=True)
    sku = Column(String(50), nullable=False, unique=True)
    name = Column(String(100))
    category = Column(String(100))
    supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    supplier_sku = Column(String(50))
    upc_code = Column(String(50))
    width = Column(Numeric(10, 2))
    depth = Column(Numeric(10, 2))
    height = Column(Numeric(10, 2))
    volume = Column(Numeric(10, 2))
    weight = Column(Numeric(10, 2))
    handling_type = Column(String(30))  # e.g. FRAGILE, STANDARD, HEAVY
    storage_temperature = Column(String(30))  # e.g. AMBIENT, CHILLED, FROZEN
    unit_price = Column(Numeric(10, 2))
    cost = Column(Numeric(10, 2))
    turnover_rate = Column(Numeric(10, 2))
    status = Column(String(20), default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    supplier = relationship("Supplier", back_populates="products")
    inventory_items = relationship("Inventory", back_populates="product")
    reorder_policy = relationship("ReorderPolicy", back_populates="product", uselist=False)
    promotions = relationship(
        "Promotion",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    demand_analytics = relationship(
        "ProductDemandAnalytics",
        back_populates="product",
        uselist=False,
    )
    logistics_metrics = relationship(
        "ProductLogisticsMetrics",
        back_populates="product",
        cascade="all, delete-orphan",
        uselist=False,
    )
    health_analytics = relationship(
        "InventoryHealthAnalytics",
        back_populates="product",
        cascade="all, delete-orphan",
        uselist=False,
    )
