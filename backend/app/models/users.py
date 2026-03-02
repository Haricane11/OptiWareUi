from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    username: str
    role: str = "staff"
    warehouse_id: Optional[int] = None
    zone_id: Optional[int] = None
    team: Optional[str] = None
    status: str = "active"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    warehouse_id: Optional[int] = None
    zone_id: Optional[int] = None
    team: Optional[str] = None
    status: Optional[str] = None

class UserOut(UserBase):
    id: int
    created_at: datetime
    zone_name: Optional[str] = None
    floor_number: Optional[int] = None

    class Config:
        from_attributes = True
