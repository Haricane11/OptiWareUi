"""
Inventory Health Classification Router.

Endpoints to trigger the computation of rule-based product health classifications.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.services.inventory_classification_service import InventoryClassificationService
from app.services.action_suggestion_engine import ActionSuggestionEngine
from app.models.inventory_health_analytics import InventoryHealthAnalytics, RecommendedAction
from app.models.products import Product
from app.models.promotion import Promotion, DiscountType, ApprovalStatus
from app.models.bundle import Bundle, BundleItem
import datetime

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

from typing import Optional, List, Dict

class ExecuteActionsRequest(BaseModel):
    product_ids: List[int]
    manual_pairs: Optional[Dict[int, int]] = None

@router.post("/execute-actions")
async def execute_batch_actions(
    req: ExecuteActionsRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Execute the recommended action for a batch of products. 
    DISCOUNT -> Creates an active Promotion
    BUNDLE -> Creates an active Bundle blending with a fast mover
    """
    if not req.product_ids:
        return {"message": "No products selected", "executed_count": 0}

    executed_count = 0
    results = []

    async with db.begin():
        stmt = select(InventoryHealthAnalytics, Product).join(
            Product, Product.id == InventoryHealthAnalytics.product_id
        ).where(InventoryHealthAnalytics.product_id.in_(req.product_ids))
        
        db_records = (await db.execute(stmt)).all()

        for rec, prod in db_records:
            # Reconstruct string of action
            action = rec.recommended_action.value if hasattr(rec.recommended_action, 'value') else str(rec.recommended_action)
            
            if action == "DISCOUNT":
                # Create a 20% discount promotion
                promo = Promotion(
                    name=f"Auto-Discount: {prod.name}",
                    product_id=prod.id,
                    discount_type=DiscountType.PERCENTAGE,
                    discount_value=20.0,
                    valid_from=datetime.datetime.now(datetime.timezone.utc),
                    valid_until=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30),
                    is_active=True,
                    approval_status=ApprovalStatus.APPROVED,
                )
                db.add(promo)
                rec.recommended_action = RecommendedAction.NONE
                executed_count += 1
                results.append({"product_id": prod.id, "action": "DISCOUNT", "status": "Success"})
            
            elif action == "BUNDLE":
                fast_prod = None
                
                # Check for manual pairing first
                if req.manual_pairs and str(prod.id) in req.manual_pairs:
                    manual_id = req.manual_pairs[str(prod.id)]
                    manual_stmt = select(Product).where(Product.id == manual_id)
                    fast_prod = (await db.execute(manual_stmt)).scalar_one_or_none()
                    
                # If no manual pairing or it was invalid, fallback to automatic
                if not fast_prod:
                    fast_stmt = select(InventoryHealthAnalytics, Product).join(
                        Product, Product.id == InventoryHealthAnalytics.product_id
                    ).where(InventoryHealthAnalytics.recommended_action != RecommendedAction.BUNDLE).order_by(InventoryHealthAnalytics.velocity_score.desc()).limit(1)
                    
                    fast_rec_prod = (await db.execute(fast_stmt)).first()
                    fast_prod = fast_rec_prod[1] if fast_rec_prod else None

                # Generate a bundle price (1 * slow + 1 * fast, discounted 15%)
                base_price = float(prod.unit_price or 10.0)
                fast_price = float(fast_prod.unit_price or 10.0) if fast_prod else 0.0
                bundle_price = (base_price + fast_price) * 0.85

                bundle_name = f"Clearance Bundle: {prod.name}"
                if fast_prod:
                    bundle_name += f" + {fast_prod.name}"

                bundle = Bundle(
                    bundle_name=bundle_name,
                    bundle_price=bundle_price,
                    is_active=True,
                )
                db.add(bundle)
                await db.flush() # get id
                
                # Add the slow moving item
                db.add(BundleItem(bundle_id=bundle.id, product_id=prod.id, quantity=1))
                
                # Add the fast moving item if found
                if fast_prod:
                    db.add(BundleItem(bundle_id=bundle.id, product_id=fast_prod.id, quantity=1))

                rec.recommended_action = RecommendedAction.NONE
                executed_count += 1
                results.append({"product_id": prod.id, "action": "BUNDLE", "status": "Success"})
            
            elif action == "DISPOSAL":
                from app.services.inventory_service import InventoryService
                # Call centralized disposal for all available stock
                disp_res = await InventoryService.dispose_stock(
                    db=db,
                    product_id=prod.id,
                    warehouse_id=None, # across all warehouses
                    qty=999999,
                    reason="Bulk Strategy Disposal"
                )
                
                rec.recommended_action = RecommendedAction.NONE
                executed_count += 1
                results.append({
                    "product_id": prod.id, 
                    "action": "DISPOSAL", 
                    "status": "Success",
                    "executed_quantity": disp_res["executed_quantity"],
                    "loss_value": disp_res["write_off_value"]
                })

    return {
        "message": f"Successfully executed bulk strategy for {executed_count} items",
        "executed_count": executed_count,
        "details": results
    }
