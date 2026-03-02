"""Sales router — order CRUD and state machine transitions."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import SalesOrderCreate, SalesOrderResponse
from app.services.sales_service import SalesService

router = APIRouter(prefix="/sales", tags=["Sales Orders"])


@router.post("/orders", response_model=SalesOrderResponse)
async def create_order(payload: SalesOrderCreate, db: AsyncSession = Depends(get_db)):
    async with db.begin():
        order = await SalesService.create_order(
            db,
            order_number=payload.order_number,
            customer_id=payload.customer_id,
            warehouse_id=payload.warehouse_id,
            items=[i.model_dump() for i in payload.items],
            priority_level=payload.priority_level,
            order_date=payload.order_date,
        )
    return SalesOrderResponse.model_validate(order)


@router.get("/orders/{order_id}", response_model=SalesOrderResponse)
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await SalesService.get_order(db, order_id)
    return SalesOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/confirm", response_model=SalesOrderResponse)
async def confirm_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """CREATED → CONFIRMED"""
    async with db.begin():
        order = await SalesService.confirm_order(db, order_id)
    return SalesOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/allocate", response_model=SalesOrderResponse)
async def allocate_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """CONFIRMED → ALLOCATED (allocates stock per item via FEFO)"""
    async with db.begin():
        order = await SalesService.allocate_order(db, order_id)
    return SalesOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/deliver", response_model=SalesOrderResponse)
async def deliver_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """ALLOCATED → DELIVERED (deducts physical stock, creates delivery note)"""
    async with db.begin():
        order = await SalesService.deliver_order(db, order_id)
    return SalesOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/close", response_model=SalesOrderResponse)
async def close_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """DELIVERED → CLOSED"""
    async with db.begin():
        order = await SalesService.close_order(db, order_id)
    return SalesOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/cancel", response_model=SalesOrderResponse)
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """Cancel order (releases allocation if ALLOCATED)."""
    async with db.begin():
        order = await SalesService.cancel_order(db, order_id)
    return SalesOrderResponse.model_validate(order)
