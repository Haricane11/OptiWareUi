"""
Inventory Health Classification Router.

Endpoints to trigger the computation of rule-based product health classifications.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.inventory_classification_service import InventoryClassificationService

router = APIRouter(prefix="/inventory-health", tags=["Inventory Classification"])

@router.get("/")
async def get_all_health(
    sort_by: Optional[str] = Query("severity_score", description="Sort field: severity_score, velocity, overstock, capital"),
    order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve all classifications across the portfolio, ordered by Risk/Severity/Velocity.
    """
    try:
        results = await InventoryClassificationService.get_all_classifications(
            db, sort_by=sort_by, order=order
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recalculate/{product_id}")
async def recalculate_product_health(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Recalculate the classification rules for a single product. 
    Integrates shipment turnover, demand, and inventory age into a severity score.
    """
    async with db.begin():
        try:
            record = await InventoryClassificationService.compute_inventory_health(db, product_id)
            classification = record.classification.value if hasattr(record.classification, 'value') else str(record.classification)
            action = record.recommended_action.value if hasattr(record.recommended_action, 'value') else str(record.recommended_action)
            return {
                "message": "Recalculation successful",
                "product_id": product_id,
                "classification": classification,
                "recommended_action": action,
                "severity_score": float(record.dead_stock_severity_score),
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.post("/recalculate-all")
async def recalculate_all_health(db: AsyncSession = Depends(get_db)):
    """
    Batch recalculate classifications for all ACTIVE products.
    """
    async with db.begin():
        try:
            results = await InventoryClassificationService.compute_all_inventory_health(db)
            return {
                "message": "Batch recalculation completed",
                "summary": results
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.get("/{product_id}")
async def get_product_health(product_id: int, db: AsyncSession = Depends(get_db)):
    """
    Retrieve the latest computed classification and recommendations for a product.
    Returns structured data for frontend dashboards.
    """
    result = await InventoryClassificationService.get_classification(db, product_id)
    if not result:
        raise HTTPException(status_code=404, detail="Health classification not found for this product. Run recalculate first.")
    
    return result
