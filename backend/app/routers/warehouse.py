"""Warehouse router — CRUD for warehouse hierarchy."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import WarehouseCreate, FloorCreate, ZoneCreate, ShelfCreate
from app.models.warehouse import Warehouse, Floor, Zone, Shelf

router = APIRouter(prefix="/warehouse", tags=["Warehouse"])


# ── Warehouses ────────────────────────────────────────────────────────
@router.post("/")
async def create_warehouse(payload: WarehouseCreate, db: AsyncSession = Depends(get_db)):
    async with db.begin():
        wh = Warehouse(**payload.model_dump())
        db.add(wh)
        await db.flush()
    return {"id": wh.id, "name": wh.name}


@router.get("/")
async def list_warehouses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Warehouse))
    return [
        {"id": w.id, "name": w.name, "location": w.location, "status": w.status}
        for w in result.scalars().all()
    ]


# ── Floors ────────────────────────────────────────────────────────────
@router.post("/floors")
async def create_floor(payload: FloorCreate, db: AsyncSession = Depends(get_db)):
    async with db.begin():
        f = Floor(**payload.model_dump())
        db.add(f)
        await db.flush()
    return {"id": f.id, "warehouse_id": f.warehouse_id, "floor_number": f.floor_number}


# ── Zones ─────────────────────────────────────────────────────────────
@router.post("/zones")
async def create_zone(payload: ZoneCreate, db: AsyncSession = Depends(get_db)):
    async with db.begin():
        z = Zone(**payload.model_dump())
        db.add(z)
        await db.flush()
    return {"id": z.id, "zone_name": z.zone_name}


# ── Shelves ───────────────────────────────────────────────────────────
@router.post("/shelves")
async def create_shelf(payload: ShelfCreate, db: AsyncSession = Depends(get_db)):
    async with db.begin():
        s = Shelf(**payload.model_dump())
        db.add(s)
        await db.flush()
    return {"id": s.id, "shelf_code": s.shelf_code}


@router.get("/shelves/{shelf_id}")
async def get_shelf(shelf_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Shelf).where(Shelf.id == shelf_id))
    shelf = result.scalar_one_or_none()
    if not shelf:
        return {"detail": "Not found"}
    return {
        "id": shelf.id,
        "shelf_code": shelf.shelf_code,
        "max_weight": float(shelf.max_weight) if shelf.max_weight else None,
        "current_weight": float(shelf.current_weight) if shelf.current_weight else 0,
        "volume": float(shelf.volume) if shelf.volume else None,
        "used_volume": float(shelf.used_volume) if shelf.used_volume else 0,
        "temperature_zone": shelf.temperature_zone,
        "can_store_hazardous": shelf.can_store_hazardous,
        "status": shelf.status,
    }
