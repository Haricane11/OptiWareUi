"""Purchase router — PO CRUD and state machine transitions."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import (
    PurchaseOrderCreate, PurchaseOrderResponse, ReceiveGoodsRequest,
)
from app.services.purchase_service import PurchaseService

router = APIRouter(prefix="/purchase", tags=["Purchase Orders"])


@router.post("/orders", response_model=PurchaseOrderResponse)
async def create_po(payload: PurchaseOrderCreate, db: AsyncSession = Depends(get_db)):
    async with db.begin():
        po = await PurchaseService.create_po(
            db,
            po_number=payload.po_number,
            supplier_id=payload.supplier_id,
            warehouse_id=payload.warehouse_id,
            items=[i.model_dump() for i in payload.items],
            expected_date=payload.expected_date,
        )
    return PurchaseOrderResponse.model_validate(po)


@router.get("/orders/{po_id}", response_model=PurchaseOrderResponse)
async def get_po(po_id: int, db: AsyncSession = Depends(get_db)):
    po = await PurchaseService.get_po(db, po_id)
    return PurchaseOrderResponse.model_validate(po)


@router.post("/orders/{po_id}/submit", response_model=PurchaseOrderResponse)
async def submit_po(po_id: int, db: AsyncSession = Depends(get_db)):
    """DRAFT → ORDERED"""
    async with db.begin():
        po = await PurchaseService.submit_po(db, po_id)
    return PurchaseOrderResponse.model_validate(po)


@router.post("/orders/{po_id}/receive")
async def receive_goods(po_id: int, payload: ReceiveGoodsRequest, db: AsyncSession = Depends(get_db)):
    """Receive goods against a PO. Creates receipt + inventory batches."""
    async with db.begin():
        receipt = await PurchaseService.receive_goods(
            db, po_id, [i.model_dump() for i in payload.items],
        )
    return {
        "receipt_id": receipt.id,
        "receipt_number": receipt.receipt_number,
        "status": receipt.status,
    }


@router.post("/orders/{po_id}/close", response_model=PurchaseOrderResponse)
async def close_po(po_id: int, db: AsyncSession = Depends(get_db)):
    """FULLY_RECEIVED → CLOSED"""
    async with db.begin():
        po = await PurchaseService.close_po(db, po_id)
    return PurchaseOrderResponse.model_validate(po)


@router.post("/orders/{po_id}/cancel", response_model=PurchaseOrderResponse)
async def cancel_po(po_id: int, db: AsyncSession = Depends(get_db)):
    """DRAFT / ORDERED → CANCELLED"""
    async with db.begin():
        po = await PurchaseService.cancel_po(db, po_id)
    return PurchaseOrderResponse.model_validate(po)
