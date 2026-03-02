"""Receipt & Placement router."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import PlacementRequest
from app.models.receipt import Receipt, ReceiptItem
from app.services.placement_service import PlacementService

router = APIRouter(prefix="/receipts", tags=["Receipts & Placement"])


@router.get("/{receipt_id}")
async def get_receipt(receipt_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Receipt)
        .where(Receipt.id == receipt_id)
        .options(selectinload(Receipt.items))
    )
    receipt = result.scalar_one_or_none()
    if not receipt:
        return {"detail": "Not found"}
    return {
        "id": receipt.id,
        "receipt_number": receipt.receipt_number,
        "purchase_order_id": receipt.purchase_order_id,
        "status": receipt.status,
        "received_at": str(receipt.received_at) if receipt.received_at else None,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "received_qty": item.received_qty,
                "batch_number": item.batch_number,
                "placement_status": item.placement_status,
                "assigned_shelf_id": item.assigned_shelf_id,
            }
            for item in receipt.items
        ],
    }


@router.post("/{receipt_item_id}/suggest-placement")
async def suggest_placement(receipt_item_id: int, db: AsyncSession = Depends(get_db)):
    """Get optimal shelf suggestions for a receipt item."""
    async with db.begin():
        suggestions = await PlacementService.suggest_placement(db, receipt_item_id)
    return {"suggestions": suggestions}


@router.post("/place")
async def execute_placement(payload: PlacementRequest, db: AsyncSession = Depends(get_db)):
    """Place inventory on a shelf with capacity validation."""
    async with db.begin():
        result = await PlacementService.execute_placement(
            db, payload.receipt_item_id, payload.shelf_id, payload.qty,
        )
    return result
