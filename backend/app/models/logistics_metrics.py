"""ProductLogisticsMetrics model — imported KPI and ML metrics."""

from sqlalchemy import Column, Integer, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ProductLogisticsMetrics(Base):
    """
    Extraneous ML features and business KPIs ingested from datasets.
    Keeps core operational models like Product and Inventory clean.
    """
    __tablename__ = "product_logistics_metrics"

    product_id = Column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True,
    )
    item_popularity_score = Column(Numeric(5, 2), nullable=True)
    picking_time_seconds = Column(Integer, nullable=True)
    handling_cost_per_unit = Column(Numeric(10, 2), nullable=True)
    stockout_count_last_month = Column(Integer, nullable=True)
    order_fulfillment_rate = Column(Numeric(5, 2), nullable=True)
    total_orders_last_month = Column(Integer, nullable=True)
    layout_efficiency_score = Column(Numeric(5, 2), nullable=True)
    forecasted_demand_next_7d = Column(Numeric(12, 4), nullable=True)
    kpi_score = Column(Numeric(5, 2), nullable=True)
    
    last_updated = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────────────
    product = relationship("Product", back_populates="logistics_metrics")
