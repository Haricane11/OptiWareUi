"""ReorderPolicy model — dynamic demand-driven reorder configuration and computed metrics."""

from sqlalchemy import Column, Integer, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import relationship, deferred
from sqlalchemy.sql import func

from app.core.database import Base


class ReorderPolicy(Base):
    """
    Stores both configuration parameters (lead_time_days, ordering_cost, etc.)
    and dynamically computed metrics (average_daily_demand, safety_stock, rop, eoq).

    Existing static fields are preserved for backward compatibility.
    When last_computed_at is populated, the ReorderService uses dynamic values;
    otherwise it falls back to the original static values.
    """
    __tablename__ = "reorder_policy"

    # ── Primary key ───────────────────────────────────────────────────
    product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)

    # ── Existing fields (kept for backward compatibility) ─────────────
    reorder_point = Column(Integer)
    safety_stock = Column(Integer)
    eoq = Column(Integer)
    reorder_frequency_days = Column(Integer)
    lead_time_days = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ── New configurable parameters ───────────────────────────────────
    demand_window_days = deferred(Column(Integer, default=90, nullable=False, server_default="90"))
    ordering_cost = deferred(Column(Numeric(10, 2)))
    holding_cost = deferred(Column(Numeric(10, 2)))
    service_level = deferred(Column(Numeric(5, 2), default=1.65, nullable=False, server_default="1.65"))

    # ── Computed demand metrics ───────────────────────────────────────
    average_daily_demand = deferred(Column(Numeric(12, 4)))
    demand_std_dev = deferred(Column(Numeric(12, 4)))
    last_computed_at = deferred(Column(DateTime(timezone=True)))

    # ── Relationships ─────────────────────────────────────────────────
    product = relationship("Product", back_populates="reorder_policy")
