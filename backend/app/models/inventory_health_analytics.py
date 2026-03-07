"""
Inventory Health Analytics model — stores the computed classification rules
for Slow-Moving and Dead Stock, including severity scores and recommendations.
"""

import enum

from sqlalchemy import Column, Integer, Numeric, ForeignKey, DateTime, Enum, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class HealthClassification(str, enum.Enum):
    HEALTHY = "HEALTHY"
    SLOW_MOVING = "SLOW_MOVING"
    DORMANT = "DORMANT"
    DEAD = "DEAD"


class RecommendedAction(str, enum.Enum):
    NONE = "NONE"
    BUNDLE = "BUNDLE"
    DISCOUNT = "DISCOUNT"
    HEAVY_DISCOUNT = "HEAVY_DISCOUNT"
    DISPOSAL = "DISPOSAL"


class InventoryHealthAnalytics(Base):
    """
    Stores rule-based classifications of product health.
    Integrated with ProductDemandAnalytics and ReorderPolicy.
    """
    __tablename__ = "inventory_health_analytics"
    __table_args__ = (
        CheckConstraint(
            "dead_stock_severity_score >= 0",
            name="ck_health_analytics_severity_range",
        ),
    )

    product_id = Column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True,
    )
    days_since_last_sale = Column(Integer, nullable=False, default=0)
    turnover_ratio = Column(Numeric(10, 4), nullable=False, default=0)
    inventory_age_days = Column(Integer, nullable=False, default=0)
    dead_stock_severity_score = Column(Numeric(10, 4), nullable=False, default=0)
    previous_severity_score = Column(Numeric(10, 4), nullable=True)
    
    velocity_score = Column(Numeric(10, 4), nullable=False, default=0)
    normalized_velocity = Column(Numeric(10, 4), nullable=False, default=0)
    overstock_ratio = Column(Numeric(10, 4), nullable=False, default=0)
    coefficient_of_variation = Column(Numeric(10, 4), nullable=False, default=0)
    
    classification = Column(
        Enum(HealthClassification, name="health_classification_enum"),
        nullable=False,
        default=HealthClassification.HEALTHY,
    )
    recommended_action = Column(
        Enum(RecommendedAction, name="recommended_action_enum"),
        nullable=False,
        default=RecommendedAction.NONE,
    )
    
    previous_classification = Column(
        Enum(HealthClassification, name="health_classification_enum"),
        nullable=True,
    )
    consecutive_confirmation_count = Column(Integer, nullable=False, default=0)
    
    last_evaluated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────────────
    product = relationship("Product", back_populates="health_analytics")
