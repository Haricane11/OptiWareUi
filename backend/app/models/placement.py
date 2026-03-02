"""Placement suggestion model."""

from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class PlacementSuggestion(Base):
    __tablename__ = "placement_suggestions"

    id = Column(Integer, primary_key=True)
    receipt_item_id = Column(Integer, ForeignKey("receipt_items.id"), nullable=False)
    shelf_id = Column(Integer, ForeignKey("shelves.id"), nullable=False)
    algorithm = Column(String(30))
    fitness_score = Column(Numeric(5, 3))
    suggested_qty = Column(Integer)
    status = Column(String(20), default="SUGGESTED")  # SUGGESTED, ACCEPTED, REJECTED
    created_at = Column(DateTime(timezone=True), server_default=func.now())
