from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime

class PurchaseOrderListOut(BaseModel):
    id: int
    po_number: str
    supplier_id: int
    supplier_name: str
    status: str
    expected_date: Optional[date] = None
    created_at: Optional[datetime] = None
    items_count: int
    total_amount: float

class PurchaseOrderItemOut(BaseModel):
    id: int
    product_id: int
    sku: Optional[str] = None
    product_name: str
    qty: int
    unit_price: float
    line_total: float

class PurchaseOrderDetailOut(BaseModel):
    id: int
    po_number: str
    supplier_id: int
    supplier_name: str
    supplier_address: Optional[str] = None
    supplier_contact_person: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_phone: Optional[str] = None

    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None

    status: str
    expected_date: Optional[date] = None
    created_at: Optional[datetime] = None

    items: List[PurchaseOrderItemOut]
    items_count: int
    total_amount: float

# ===== Create models (New Order) =====
class PurchaseOrderItemCreate(BaseModel):
    product_id: int
    ordered_qty: int = Field(..., ge=1)

class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    warehouse_id: int
    expected_date: Optional[date] = None
    status: str = "pending"
    items: List[PurchaseOrderItemCreate] = Field(default_factory=list, min_length=1)
