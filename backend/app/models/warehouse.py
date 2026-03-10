"""Warehouse domain models: Warehouse, Floor, Area, Zone, Shelf, ShelfType."""

from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey,
    CheckConstraint, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    location = Column(String(200))
    status = Column(String(20), default="ACTIVE")
    created_by = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    width = Column(Numeric)
    height = Column(Numeric)
    depth = Column(Numeric)
    code = Column(String(20))
    role = Column(String(50))

    floors = relationship("Floor", back_populates="warehouse")


class Floor(Base):
    __tablename__ = "floors"

    id = Column(Integer, primary_key=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    floor_number = Column(Integer, nullable=False)

    warehouse = relationship("Warehouse", back_populates="floors")
    zones = relationship("Zone", back_populates="floor")
    areas = relationship("Area", back_populates="floor")


class Area(Base):
    __tablename__ = "areas"

    id = Column(Integer, primary_key=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=False)
    area_name = Column(String)
    width = Column(Numeric)
    height = Column(Numeric)
    depth = Column(Numeric)
    location_x = Column(Numeric(10, 2))
    location_y = Column(Numeric(10, 2))
    area_type = Column(String)
    usage_category = Column(String)
    is_passable = Column(Boolean, default=True)

    floor = relationship("Floor", back_populates="areas")


class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=False)
    zone_code = Column(String(30), nullable=True)
    zone_type = Column(String(30), nullable=True)
    width = Column(Numeric(10, 2))
    depth = Column(Numeric(10, 2))
    status = Column(String(20), default="ACTIVE")
    location_x = Column(Numeric(10, 2))
    location_y = Column(Numeric(10, 2))
    product_category = Column(String(100), nullable=False)
    name = Column(String(100))
    code = Column(String(30))
    zone_name = Column(String(100))
    floor_number = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    floor = relationship("Floor", back_populates="zones")
    shelves = relationship("Shelf", back_populates="zone")


class ShelfType(Base):
    __tablename__ = "shelf_types"

    type_code = Column(String(30), primary_key=True)
    type_name = Column(String(50), nullable=False)
    default_gap = Column(Numeric(5, 2))
    accessibility_rating = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Shelf(Base):
    __tablename__ = "shelves"
    __table_args__ = (
        CheckConstraint("current_weight <= max_weight", name="ck_shelf_weight"),
        CheckConstraint("used_volume <= volume", name="ck_shelf_volume"),
        Index("ix_shelf_zone", "zone_id"),
        Index("ix_shelf_temperature", "temperature_zone"),
        Index("ix_shelf_status", "status"),
    )

    id = Column(Integer, primary_key=True)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=False)
    shelf_code = Column(String(30), nullable=True)
    shelf_type = Column(String(30), ForeignKey("shelf_types.type_code"), nullable=True)
    aisle_num = Column(Integer)
    bay_num = Column(Integer)
    level_num = Column(Integer)
    bin_num = Column(Integer)
    width = Column(Numeric(10, 2))
    depth = Column(Numeric(10, 2))
    height = Column(Numeric(10, 2))
    volume = Column(Numeric(10, 3))
    location_x = Column(Numeric(10, 2))
    location_y = Column(Numeric(10, 2))
    location_z = Column(Numeric(10, 2))
    max_weight = Column(Numeric(10, 2))
    current_weight = Column(Numeric(10, 2), default=0)
    used_volume = Column(Numeric(10, 3), default=0)
    available_volume = Column(Numeric(10, 3))
    temperature_zone = Column(String(30))
    can_store_hazardous = Column(Boolean, default=False)
    status = Column(String(20), default="ACTIVE")
    product_category = Column(String(100))
    zone_code = Column(String(30))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    zone = relationship("Zone", back_populates="shelves")
    inventory_items = relationship("Inventory", back_populates="shelf")
