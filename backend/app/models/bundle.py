"""
Bundle models for virtual product grouping.
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    Boolean,
    ForeignKey,
    DateTime,
    Index,
    CheckConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Bundle(Base):
    __tablename__ = "bundles"

    __table_args__ = (
        Index("ix_bundle_active", "is_active"),
    )

    id = Column(Integer, primary_key=True)

    bundle_name = Column(String(100), nullable=False)
    bundle_price = Column(Numeric(10, 2), nullable=False)

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    items = relationship(
        "BundleItem",
        back_populates="bundle",
        cascade="all, delete-orphan",
    )


class BundleItem(Base):
    __tablename__ = "bundle_items"

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_bundle_quantity_positive"),
        Index("ix_bundle_item_bundle", "bundle_id"),
        Index("ix_bundle_item_product", "product_id"),
    )

    id = Column(Integer, primary_key=True)

    bundle_id = Column(
        Integer,
        ForeignKey("bundles.id", ondelete="CASCADE"),
        nullable=False,
    )

    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
    )

    quantity = Column(Integer, nullable=False)

    # Relationships
    bundle = relationship("Bundle", back_populates="items")
    product = relationship("Product")


class BundleSale(Base):
    __tablename__ = "bundle_sales"

    id = Column(Integer, primary_key=True)

    bundle_id = Column(
        Integer,
        ForeignKey("bundles.id", ondelete="CASCADE"),
        nullable=False,
    )

    sales_order_id = Column(
        Integer,
        ForeignKey("sales_orders.id", ondelete="CASCADE"),
        nullable=False,
    )

    quantity = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    bundle = relationship("Bundle")
    sales_order = relationship("SalesOrder")
