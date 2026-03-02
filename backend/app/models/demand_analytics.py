"""ProductDemandAnalytics model — denormalized snapshot of computed demand metrics."""

from sqlalchemy import Column, Integer, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ProductDemandAnalytics(Base):
    """
    Denormalized, queryable snapshot of demand metrics per product.

    Populated by DemandAnalysisService during periodic recalculation.
    Provides a fast read path for dashboards and reporting without
    needing to recompute from raw shipment data.
    """
    __tablename__ = "product_demand_analytics"

    product_id = Column(
        Integer, ForeignKey("products.id"), primary_key=True,
    )
    average_daily_demand = Column(Numeric(12, 4), nullable=False, default=0)
    demand_std_dev = Column(Numeric(12, 4), nullable=False, default=0)
    window_days = Column(Integer, nullable=False, default=90)
    sample_size = Column(Integer, nullable=False, default=0)
    last_updated = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────────────
    product = relationship("Product", back_populates="demand_analytics")
