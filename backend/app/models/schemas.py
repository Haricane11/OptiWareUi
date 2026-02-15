from pydantic import BaseModel
from typing import List, Optional

# Pydantic Models for Schema Alignment

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
    status: str
    created_by: int
    floors: List[FloorCreate]

class WarehouseUpdate(BaseModel):
    name: str
    location: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    num_floors: Optional[int] = None

class LoginRequest(BaseModel):
    username: str
    password: str
