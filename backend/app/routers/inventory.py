"""Inventory router — stock operations."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import (
    AllocateStockRequest, ReleaseAllocationRequest,
    DeductStockRequest, StockResponse, BatchResponse,
)
from app.services.inventory_service import InventoryService
from app.services.reorder_service import ReorderService

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.post("/allocate")
async def allocate_stock(payload: AllocateStockRequest, db: AsyncSession = Depends(get_db)):
    """Allocate stock using FEFO strategy with row-level locking."""
    async with db.begin():
        result = await InventoryService.allocate_stock(
            db, payload.product_id, payload.qty, payload.warehouse_id,
        )
    return {"allocated_from": result}


@router.post("/release")
async def release_allocation(payload: ReleaseAllocationRequest, db: AsyncSession = Depends(get_db)):
    """Release previously allocated stock."""
    async with db.begin():
        result = await InventoryService.release_allocation(
            db, payload.product_id, payload.qty, payload.warehouse_id,
        )
    return {"released_from": result}


@router.post("/deduct")
async def deduct_stock(payload: DeductStockRequest, db: AsyncSession = Depends(get_db)):
    """Physically deduct stock after delivery. Triggers reorder check."""
    async with db.begin():
        result = await InventoryService.deduct_physical_stock(
            db, payload.product_id, payload.qty, payload.warehouse_id,
        )
        # Option A: trigger reorder check after deduction
        reorder_result = await ReorderService.check_and_reorder(db, payload.product_id)
    return {"deducted_from": result, "reorder_check": reorder_result}


@router.get("/stock/{product_id}", response_model=StockResponse)
async def get_stock(
    product_id: int,
    warehouse_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated available stock for a product."""
    return await InventoryService.get_available_stock(db, product_id, warehouse_id)


@router.get("/batches/{product_id}")
async def get_batches(
    product_id: int,
    warehouse_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List inventory batches (FEFO ordered)."""
    batches = await InventoryService.get_batches(db, product_id, warehouse_id)
    return [
        BatchResponse.model_validate(b).model_dump()
        for b in batches
    ]
