"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, Field, model_validator
from datetime import date, datetime
from typing import Optional


# ── Common ────────────────────────────────────────────────────────────
class MessageResponse(BaseModel):
    detail: str


# ── Inventory ─────────────────────────────────────────────────────────
class AllocateStockRequest(BaseModel):
    product_id: int
    qty: int = Field(gt=0)
    warehouse_id: int


class ReleaseAllocationRequest(BaseModel):
    product_id: int
    qty: int = Field(gt=0)
    warehouse_id: int


class DeductStockRequest(BaseModel):
    product_id: int
    qty: int = Field(gt=0)
    warehouse_id: int


class StockResponse(BaseModel):
    product_id: int
    warehouse_id: int
    total_quantity: int
    allocated_quantity: int
    available_quantity: int


class BatchResponse(BaseModel):
    id: int
    batch_number: Optional[str] = None
    quantity: int
    allocated: int
    available: int
    expiry_date: Optional[date] = None
    received_date: Optional[date] = None
    shelf_id: Optional[int] = None
    status: str

    class Config:
        from_attributes = True


class InventoryListItem(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_sku: str
    product_unit_price: Optional[float] = None
    warehouse_id: int
    warehouse_name: str
    zone_id: Optional[int] = None
    zone_name: Optional[str] = None
    shelf_id: int
    shelf_code: str
    aisle_num: Optional[int] = None
    shelf_total_volume: Optional[float] = None
    batch_number: Optional[str] = None
    quantity: int
    allocated: int
    available: int
    total_volume: Optional[float] = None
    total_weight: Optional[float] = None
    expiry_date: Optional[date] = None
    received_date: Optional[date] = None
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Sales ─────────────────────────────────────────────────────────────
class SalesOrderItemCreate(BaseModel):
    # product_id: int
    # ordered_qty: int = Field(gt=0)
    product_id: Optional[int] = None
    bundle_id: Optional[int] = None
    ordered_qty: int = Field(gt=0)

    @model_validator(mode="after")
    def validate_product_or_bundle(self):
        if not self.product_id and not self.bundle_id:
            raise ValueError("Either product_id or bundle_id must be provided.")
        return self

class SalesOrderCreate(BaseModel):
    order_number: str
    customer_id: int
    warehouse_id: int
    priority_level: Optional[str] = None
    order_date: Optional[date] = None
    items: list[SalesOrderItemCreate]


class SalesOrderResponse(BaseModel):
    id: int
    order_number: str
    customer_id: int
    warehouse_id: int
    status: str
    priority_level: Optional[str] = None
    order_date: Optional[date] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Purchase ──────────────────────────────────────────────────────────
class PurchaseOrderItemCreate(BaseModel):
    product_id: int
    ordered_qty: int = Field(gt=0)


class PurchaseOrderCreate(BaseModel):
    po_number: str
    supplier_id: int
    warehouse_id: int
    expected_date: Optional[date] = None
    items: list[PurchaseOrderItemCreate]


class PurchaseOrderResponse(BaseModel):
    id: int
    po_number: str
    supplier_id: int
    warehouse_id: int
    status: str
    expected_date: Optional[date] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Receipt ───────────────────────────────────────────────────────────
class ReceiveItemInput(BaseModel):
    product_id: int
    received_qty: int = Field(gt=0)
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    measured_width: Optional[float] = None
    measured_depth: Optional[float] = None
    measured_height: Optional[float] = None
    measured_weight: Optional[float] = None


class ReceiveGoodsRequest(BaseModel):
    items: list[ReceiveItemInput]


class PlacementRequest(BaseModel):
    receipt_item_id: int
    shelf_id: int
    qty: int = Field(gt=0)


# ── Warehouse ─────────────────────────────────────────────────────────
class WarehouseCreate(BaseModel):
    name: str
    location: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None


class FloorCreate(BaseModel):
    warehouse_id: int
    floor_number: int


class ZoneCreate(BaseModel):
    floor_id: int
    zone_name: str
    zone_type: str
    width: Optional[float] = None
    depth: Optional[float] = None


class ShelfCreate(BaseModel):
    zone_id: int
    shelf_code: str
    shelf_type: Optional[str] = None
    aisle_num: Optional[int] = None
    bay_num: Optional[int] = None
    level_num: Optional[int] = None
    bin_num: Optional[int] = None
    width: Optional[float] = None
    depth: Optional[float] = None
    height: Optional[float] = None
    volume: Optional[float] = None
    max_weight: Optional[float] = None
    temperature_zone: Optional[str] = None
    can_store_hazardous: bool = False
    product_category: Optional[str] = None


# ── Reorder ───────────────────────────────────────────────────────────
class ReorderCheckResponse(BaseModel):
    product_id: int
    available_stock: int
    reorder_point: int
    needs_reorder: bool
    po_created: bool
    po_id: Optional[int] = None
    detail: str


# ── Demand Analysis ──────────────────────────────────────────────
class DemandMetricsResponse(BaseModel):
    product_id: int
    average_daily_demand: float
    demand_std_dev: float
    window_days: int
    sample_size: int
    last_updated: Optional[datetime] = None

    class Config:
        from_attributes = True


class DemandRecalculateResponse(BaseModel):
    product_id: int
    status: str
    average_daily_demand: Optional[float] = None
    demand_std_dev: Optional[float] = None
    safety_stock: Optional[int] = None
    reorder_point: Optional[int] = None
    eoq: Optional[int] = None
    lead_time_days: Optional[int] = None
    window_days: Optional[int] = None
    sample_size: Optional[int] = None
    total_shipped: Optional[int] = None
    detail: Optional[str] = None


class DemandRecalculateAllResponse(BaseModel):
    results: list[DemandRecalculateResponse]


# ── Logistics Metrics ─────────────────────────────────────────────────
class ProductLogisticsMetricsResponse(BaseModel):
    product_id: int
    item_popularity_score: Optional[float] = None
    picking_time_seconds: Optional[int] = None
    handling_cost_per_unit: Optional[float] = None
    stockout_count_last_month: Optional[int] = None
    order_fulfillment_rate: Optional[float] = None
    total_orders_last_month: Optional[int] = None
    layout_efficiency_score: Optional[float] = None
    forecasted_demand_next_7d: Optional[float] = None
    kpi_score: Optional[float] = None
    last_updated: Optional[datetime] = None

    class Config:
        from_attributes = True
