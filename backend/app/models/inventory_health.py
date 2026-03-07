"""
Inventory Health Intelligence models.

InventoryHealthStatus  — persistent health flags (DEAD / SLOW / EXPIRY)
InventoryActionSuggestion — actionable recommendations with approval workflow
InventoryOptimizationConfig — singleton configuration for thresholds & automation
"""

import enum

from sqlalchemy import (
    Column, Integer, String, Text, Numeric, Boolean, DateTime, Date,
    ForeignKey, CheckConstraint, Index, Enum, JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ── Enums ─────────────────────────────────────────────────────────────

class HealthType(str, enum.Enum):
    DEAD = "DEAD"
    SLOW = "SLOW"
    DORMANT = "DORMANT"
    EXPIRY = "EXPIRY"
    LOW = "LOW"


class SuggestionType(str, enum.Enum):
    DISCOUNT = "DISCOUNT"
    HEAVY_DISCOUNT = "HEAVY_DISCOUNT"
    BUNDLE = "BUNDLE"
    DISPOSAL = "DISPOSAL"
    RETURN = "RETURN"


class SuggestionStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXECUTED = "EXECUTED"


# ── InventoryHealthStatus ─────────────────────────────────────────────

class InventoryHealthStatus(Base):
    """Persistent record of detected inventory health issues."""

    __tablename__ = "inventory_health_status"
    __table_args__ = (
        CheckConstraint(
            "severity_score >= 0 AND severity_score <= 100",
            name="ck_health_severity_range",
        ),
        Index("ix_health_product_wh_type", "product_id", "warehouse_id", "health_type"),
        Index("ix_health_severity", "severity_score"),
        Index("ix_health_detected", "detected_at"),
    )

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inventory.id"), nullable=True)
    health_type = Column(
        Enum(HealthType, name="health_type_enum"),
        nullable=False,
    )
    severity_score = Column(Numeric(5, 2), nullable=False, default=0)
    details = Column(JSON, nullable=True)
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    product = relationship("Product")
    batch = relationship("Inventory", foreign_keys=[batch_id])
    suggestions = relationship(
        "InventoryActionSuggestion",
        back_populates="health_status",
        cascade="all, delete-orphan",
    )


# ── InventoryActionSuggestion ────────────────────────────────────────

class InventoryActionSuggestion(Base):
    """Actionable recommendation with manager approval workflow."""

    __tablename__ = "inventory_action_suggestions"
    __table_args__ = (
        CheckConstraint(
            "severity_score >= 0 AND severity_score <= 100",
            name="ck_suggestion_severity_range",
        ),
        Index("ix_suggestion_status", "status"),
        Index("ix_suggestion_product_wh", "product_id", "warehouse_id"),
        Index("ix_suggestion_type", "suggestion_type"),
    )

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inventory.id"), nullable=True)
    health_status_id = Column(
        Integer,
        ForeignKey("inventory_health_status.id", ondelete="SET NULL"),
        nullable=True,
    )
    suggestion_type = Column(
        Enum(SuggestionType, name="suggestion_type_enum"),
        nullable=False,
    )
    reasoning = Column(Text, nullable=False)
    severity_score = Column(Numeric(5, 2), nullable=False, default=0)
    suggested_discount_percent = Column(Numeric(5, 2), nullable=True)
    linked_promotion_id = Column(
        Integer, ForeignKey("promotions.id", ondelete="SET NULL"), nullable=True,
    )
    linked_bundle_id = Column(
        Integer, ForeignKey("bundles.id", ondelete="SET NULL"), nullable=True,
    )
    status = Column(
        Enum(SuggestionStatus, name="suggestion_status_enum"),
        default=SuggestionStatus.PENDING,
        nullable=False,
    )
    approved_by = Column(Integer, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    product = relationship("Product")
    health_status = relationship(
        "InventoryHealthStatus", back_populates="suggestions",
    )
    linked_promotion = relationship("Promotion", foreign_keys=[linked_promotion_id])
    linked_bundle = relationship("Bundle", foreign_keys=[linked_bundle_id])


# ── InventoryOptimizationConfig ──────────────────────────────────────

class InventoryOptimizationConfig(Base):
    """Singleton configuration for health scan thresholds and automation."""

    __tablename__ = "inventory_optimization_config"

    id = Column(Integer, primary_key=True, default=1)

    # Detection thresholds
    dead_days_threshold = Column(Integer, nullable=False, default=90)
    slow_turnover_threshold = Column(Numeric(5, 2), nullable=False, default=1.0)
    expiry_warning_days = Column(Integer, nullable=False, default=30)

    # Automation flags
    auto_discount_enabled = Column(Boolean, default=False)
    auto_bundle_enabled = Column(Boolean, default=False)

    # Discount limits
    max_discount_limit = Column(Numeric(5, 2), nullable=False, default=30.0)

    # Auto-activation threshold (severity below this = low risk)
    low_risk_severity_threshold = Column(Numeric(5, 2), nullable=False, default=40.0)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
