from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime



class ShelfCreate(BaseModel):
    shelf_code: str
    shelf_type: str
    aisle_num: int
    bay_num: int
    level_num: int
    bin_num: Optional[int] = None
    width: float
    depth: float
    height: float
    location_x: float
    location_y: float
    location_z: float
    max_weight: Optional[float] = None
    status: Optional[str] = "active"

class ShelfUpdate(BaseModel):
    shelf_code: Optional[str] = None
    shelf_type: Optional[str] = None
    width: Optional[float] = None
    depth: Optional[float] = None
    height: Optional[float] = None
    location_x: Optional[float] = None
    location_y: Optional[float] = None
    location_z: Optional[float] = None
    orientation_angle: Optional[float] = None
    max_weight: Optional[float] = None
    status: Optional[str] = None

class ZoneCreate(BaseModel):
    zone_name: str
    zone_type: str
    width: float
    depth: float
    location_x: float
    location_y: float
    shelves: Optional[List[ShelfCreate]] = []

class ZoneUpdate(BaseModel):
    zone_name: Optional[str] = None
    zone_type: Optional[str] = None
    width: Optional[float] = None
    depth: Optional[float] = None
    location_x: Optional[float] = None
    location_y: Optional[float] = None
    product_category: Optional[str] = None

class ZoneMove(BaseModel):
    location_x: float
    location_y: float

class AreaCreate(BaseModel):
    area_name: str
    width: float
    height: float
    depth: float
    location_x: float
    location_y: float
    area_type: Optional[str] = 'PATHWAY' # 'PATHWAY', 'OPERATIONAL', 'OBSTACLE'
    usage_category: Optional[str] = 'HUMAN_ONLY' # 'HUMAN_ONLY', 'FORKLIFT_LANE', 'PACKING_STATION', 'DOCK_DOOR'
    is_passable: Optional[bool] = True

class AreaUpdate(BaseModel):
    area_name: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    location_x: Optional[float] = None
    location_y: Optional[float] = None
    area_type: Optional[str] = None
    usage_category: Optional[str] = None
    is_passable: Optional[bool] = None

class FloorCreate(BaseModel):
    floor_number: int
    areas: Optional[List[AreaCreate]] = []
    zones: Optional[List[ZoneCreate]] = []

class WarehouseCreate(BaseModel):
    name: str
    location: Optional[str] = None
    width: float
    height: float
    depth: float
    role: Optional[str] = 'PRIMARY_FULFILLMENT'
    code: Optional[str] = None
    status: str
    created_by: int
    floors: List[FloorCreate]

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    role: Optional[str] = None
    code: Optional[str] = None
    status: Optional[str] = None
    num_floors: Optional[int] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class ProductCreate(BaseModel):
    sku: Optional[str] = None
    name: str
    category: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_sku: Optional[str] = None
    upc_code: Optional[str] = None
    handling_type: Optional[str] = None
    storage_temperature: Optional[str] = "ambient"
    unit_price: Optional[float] = None
    turnover_rate: Optional[str] = "medium"
    status: Optional[str] = "active"

class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_sku: Optional[str] = None
    upc_code: Optional[str] = None
    handling_type: Optional[str] = None
    storage_temperature: Optional[str] = None
    unit_price: Optional[float] = None
    turnover_rate: Optional[str] = None
    status: Optional[str] = None

# --- New Models ---

class CustomerCreate(BaseModel):
    customer_name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    shipping_address: str
    tax_id: Optional[str] = None
    status: Optional[str] = "active"

class CustomerUpdate(BaseModel):
    customer_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    shipping_address: Optional[str] = None
    tax_id: Optional[str] = None
    status: Optional[str] = None

class SalesOrderItemCreate(BaseModel):
    product_id: Optional[int] = None
    bundle_id: Optional[int] = None
    ordered_qty: int

class SalesOrderCreate(BaseModel):
    customer_id: int
    warehouse_id: int
    order_date: Optional[date] = None
    expected_delivery_date: Optional[date] = None
    priority_level: Optional[str] = "normal"
    items: List[SalesOrderItemCreate]

class SalesOrderUpdate(BaseModel):
    customer_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    status: Optional[str] = None
    priority_level: Optional[str] = None
    order_date: Optional[date] = None
    expected_delivery_date: Optional[date] = None
    items: Optional[List[SalesOrderItemCreate]] = None

class DeliveryNoteCreate(BaseModel):
    sales_order_id: int

class ConfirmPickRequest(BaseModel):
    allocation_id: int
