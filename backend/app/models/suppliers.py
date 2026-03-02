from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SupplierBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = "active"


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None


class SupplierOut(SupplierBase):
    id: int
    created_at: Optional[datetime] = None

    # computed fields for list endpoint
    products_count: int = 0
    last_order: Optional[datetime] = None

    class Config:
        from_attributes = True
