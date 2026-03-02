"""
Promotion model for product-level pricing rules.
"""

import enum 

from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    DateTime,
    ForeignKey,
    Boolean,
    CheckConstraint,
    Index,
    Enum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class DiscountType(str, enum.Enum):
    PERCENTAGE = "PERCENTAGE",
    FIXED = "FIXED",
    QUANTITY_BASED = "QUANTITY_BASED"
    
class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED"

class Promotion(Base):
    __tablename__ = "promotions"
    
    __table_args__ = (
        CheckConstraint("discount_value > 0", name="ck_discount_positive"),
        CheckConstraint(
            "valid_until IS NULL OR valid_until > valid_from",
            name="ck_valid_date_range",
        ),
        Index("ix_promotion_product", "product_id"),
        Index("ix_promotion_active", "is_active"),
        Index("ix_promotion_valid_window", "valid_from", "valid_until"),
    )
    
    id = Column(Integer, primary_key=True)
    
    name = Column(String(100), nullable=False)
    
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    
    # PERCENTAGE | FIXED | QUANTITY_BASED
    discount_type = Column(Enum(DiscountType, name="discount_type_enum"), nullable=False)
    
    discount_value = Column(Numeric(10, 2), nullable=False)
    
    # Used only if QUANTITY_BASED
    min_quantity = Column(Integer, nullable=True)
    
    valid_from = Column(DateTime(timezone=True), nullable=False)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    
    is_active = Column(Boolean, default=True)
    
    approval_status = Column(Enum(ApprovalStatus, name="approval_status_enum"), default=ApprovalStatus.PENDING, nullable=False)
    approved_by = Column(Integer, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    product = relationship("Product", back_populates="promotions")
