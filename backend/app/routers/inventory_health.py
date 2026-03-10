"""
Inventory Health Intelligence router.

Provides endpoints for health reports, action suggestions, approval workflow,
manual bundle creation, configuration management, and health scan triggers.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.inventory_health import (
    HealthReportResponse,
    HealthStatusItem,
    ActionSuggestionResponse,
    ActionSuggestionListResponse,
    ApproveRejectRequest,
    ConfigResponse,
    ConfigUpdateRequest,
    ManualBundleCreateRequest,
    ManualBundleResponse,
    ScanResultResponse,
    BundleResponse,
    BundleSaleResponse,
    BundleStatusUpdateRequest,
    PromotionResponse,
    PromotionResponse,
    PromotionStatusUpdateRequest,
    DisposalExecutionResponse,
)
from app.services.inventory_health_service import InventoryHealthService
from app.services.action_suggestion_engine import ActionSuggestionEngine

router = APIRouter(prefix="/analytics", tags=["Inventory Health Intelligence"])


# ── Health Report ─────────────────────────────────────────────────────

@router.get("/health-report", response_model=HealthReportResponse)
async def health_report(db: AsyncSession = Depends(get_db)):
    """
    Full health report: aggregated counts, value-at-risk breakdown,
    dead stock, slow-moving, and expiry-risk items.
    """
    report = await InventoryHealthService.get_health_report(db)
    return HealthReportResponse(
        total_issues=report.get("total_issues", 0),
        dead_stock_count=report.get("dead_stock_count", 0),
        dormant_count=report.get("dormant_count", 0),
        slow_moving_count=report.get("slow_moving_count", 0),
        expiry_risk_count=report.get("expiry_risk_count", 0),
        low_stock_count=report.get("low_stock_count", 0),
        total_value_at_risk=report.get("total_value_at_risk", 0.0),
        dead_stock_items=[
            HealthStatusItem.model_validate(s) for s in report.get("dead_stock_items", [])
        ],
        dormant_items=[
            HealthStatusItem.model_validate(s) for s in report.get("dormant_items", [])
        ],
        slow_moving_items=[
            HealthStatusItem.model_validate(s) for s in report.get("slow_moving_items", [])
        ],
        expiry_risk_items=[
            HealthStatusItem.model_validate(s) for s in report.get("expiry_risk_items", [])
        ],
        low_stock_items=[
            HealthStatusItem.model_validate(s) for s in report.get("low_stock_items", [])
        ],
    )


# ── Action Suggestions ───────────────────────────────────────────────

@router.get("/action-suggestions", response_model=ActionSuggestionListResponse)
async def action_suggestions(
    status: str | None = Query(None, description="Filter by status: PENDING, APPROVED, REJECTED, EXECUTED"),
    suggestion_type: str | None = Query(None, description="Filter by type: DISCOUNT, BUNDLE, DISPOSAL, RETURN"),
    search: str | None = Query(None, description="Search by product name, sku, or reasoning"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List action suggestions with optional filtering and server-side pagination."""
    suggestions, total = await InventoryHealthService.get_suggestions(
        db, status_filter=status, type_filter=suggestion_type, search_query=search, limit=limit, skip=skip
    )
    return ActionSuggestionListResponse(
        total=total,
        suggestions=[
            ActionSuggestionResponse.model_validate(s) for s in suggestions
        ],
    )


# ── Approve / Reject / Execute ───────────────────────────────────────

@router.post("/approve-action/{suggestion_id}", response_model=ActionSuggestionResponse)
async def approve_action(
    suggestion_id: int,
    payload: ApproveRejectRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Approve a suggestion — activates linked Promotion or Bundle."""
    async with db.begin():
        approved_by = payload.approved_by if payload else None
        suggestion = await ActionSuggestionEngine.approve_action(
            db, suggestion_id, approved_by
        )
    return ActionSuggestionResponse.model_validate(suggestion)


@router.post("/reject-action/{suggestion_id}", response_model=ActionSuggestionResponse)
async def reject_action(
    suggestion_id: int,
    payload: ApproveRejectRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Reject a suggestion."""
    async with db.begin():
        reason = payload.reason if payload else None
        suggestion = await ActionSuggestionEngine.reject_action(
            db, suggestion_id, reason
        )
    return ActionSuggestionResponse.model_validate(suggestion)


@router.post("/inventory-actions/create-for-product/{product_id}")
async def create_suggestion_for_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Create a suggestion on-demand for a product that doesn't have one yet."""
    from app.models.inventory_health import (
        InventoryActionSuggestion, SuggestionStatus, SuggestionType
    )
    from app.models.inventory_health_analytics import InventoryHealthAnalytics
    from app.models.inventory import Inventory
    from app.models.products import Product
    from sqlalchemy import select
    
    async with db.begin():
        # Check if a PENDING/APPROVED suggestion already exists
        existing = await db.execute(
            select(InventoryActionSuggestion).where(
                InventoryActionSuggestion.product_id == product_id,
                InventoryActionSuggestion.status.in_([SuggestionStatus.PENDING, SuggestionStatus.APPROVED])
            ).limit(1)
        )
        existing_sug = existing.scalar_one_or_none()
        if existing_sug:
            return {"action_id": existing_sug.id, "created": False}

        # Get classification from analytics
        analytics = await db.execute(
            select(InventoryHealthAnalytics).where(
                InventoryHealthAnalytics.product_id == product_id
            )
        )
        ana = analytics.scalar_one_or_none()
        if not ana:
            raise HTTPException(status_code=404, detail="No analytics found for this product.")
        
        # Get product info
        product = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none()
        product_name = product.name if product else f"Product-{product_id}"
        
        # Get warehouse from inventory
        inv_result = await db.execute(
            select(Inventory.warehouse_id).where(
                Inventory.product_id == product_id,
                Inventory.status == "ACTIVE"
            ).limit(1)
        )
        warehouse_id = inv_result.scalar_one_or_none()
        if not warehouse_id:
            # Fallback: get any warehouse (even from non-active inventory or warehouses table)
            from app.models.warehouse import Warehouse
            any_wh = await db.execute(select(Warehouse.id).limit(1))
            warehouse_id = any_wh.scalar_one_or_none()
            if not warehouse_id:
                raise HTTPException(status_code=400, detail="No warehouse available.")
        
        # Determine suggestion type based on classification and analytics recommendation
        classification_raw = ana.classification
        classification = classification_raw.value if hasattr(classification_raw, 'value') else str(classification_raw)
        recommended_action_str = str(ana.recommended_action).replace("RecommendedAction.", "") if hasattr(ana, 'recommended_action') else ""
        if hasattr(ana.recommended_action, 'value'):
            recommended_action_str = ana.recommended_action.value
        
        if classification in ("SLOW_MOVING", "DORMANT"):
            if recommended_action_str == "BUNDLE":
                sug_type = SuggestionType.BUNDLE
                reasoning = f"{classification.replace('_', ' ').title()} stock. Auto-generated bundle suggestion."
                suggestion = InventoryActionSuggestion(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    suggestion_type=sug_type,
                    reasoning=reasoning,
                    severity_score=ana.dead_stock_severity_score or 0,
                    status=SuggestionStatus.PENDING,
                )
            else:
                sug_type = SuggestionType.DISCOUNT
                discount_pct = 15.0 if classification == "SLOW_MOVING" else 20.0
                reasoning = f"{classification.replace('_', ' ').title()} stock. Auto-generated discount suggestion."
                
                suggestion = InventoryActionSuggestion(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    suggestion_type=sug_type,
                    reasoning=reasoning,
                    severity_score=ana.dead_stock_severity_score or 0,
                    suggested_discount_percent=discount_pct,
                    status=SuggestionStatus.PENDING,
                )
        elif classification == "DEAD":
            if recommended_action_str == "BUNDLE":
                sug_type = SuggestionType.BUNDLE
                reasoning = f"Dead stock with high margin. Recommend bundle creation."
                
                suggestion = InventoryActionSuggestion(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    suggestion_type=sug_type,
                    reasoning=reasoning,
                    severity_score=ana.dead_stock_severity_score or 0,
                    status=SuggestionStatus.PENDING,
                )
            else:
                sug_type = SuggestionType.DISPOSAL
                reasoning = f"Dead stock. Auto-generated disposal suggestion."
                
                suggestion = InventoryActionSuggestion(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                    suggestion_type=sug_type,
                    reasoning=reasoning,
                    severity_score=ana.dead_stock_severity_score or 0,
                    status=SuggestionStatus.PENDING,
                )
        else:
            raise HTTPException(status_code=400, detail=f"No action needed for {classification} products.")
        
        db.add(suggestion)
        await db.flush()
        
    return {"action_id": suggestion.id, "created": True}


@router.post("/inventory-actions/{action_id}/execute")
async def execute_action(
    action_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Execute an approved suggestion (DISPOSAL, DISCOUNT, or BUNDLE)."""
    async with db.begin():
        result = await ActionSuggestionEngine.execute_action(db, action_id)
    return result


# ── Write-Off History ─────────────────────────────────────────────────

@router.get("/write-off-history")
async def get_write_off_history(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    Retrieve write-off transaction history for manager review.
    Returns executed DISPOSAL actions with product/warehouse details.
    """
    from sqlalchemy import select, func, desc
    from app.models.inventory import InventoryTransaction
    from app.models.products import Product
    from app.models.warehouse import Warehouse
    import traceback

    try:
        # Count total
        count_stmt = select(func.count(InventoryTransaction.id)).where(
            InventoryTransaction.transaction_type == "WRITE_OFF"
        )
        total = (await db.execute(count_stmt)).scalar() or 0

        # Fetch records with joins
        stmt = (
            select(
                InventoryTransaction,
                Product.name.label("product_name"),
                Product.sku.label("product_sku"),
                Product.unit_price.label("unit_price"),
                Warehouse.name.label("warehouse_name"),
            )
            .outerjoin(Product, Product.id == InventoryTransaction.product_id)
            .outerjoin(Warehouse, Warehouse.id == InventoryTransaction.warehouse_id)
            .where(InventoryTransaction.transaction_type == "WRITE_OFF")
            .order_by(desc(InventoryTransaction.created_at))
            .limit(limit)
            .offset(offset)
        )
        rows = (await db.execute(stmt)).all()

        history = []
        for row in rows:
            txn = row[0]
            history.append({
                "id": txn.id,
                "product_name": row.product_name or "Unknown Product",
                "product_sku": row.product_sku or "—",
                "unit_price": float(row.unit_price) if row.unit_price else 0,
                "warehouse_name": row.warehouse_name or "Unknown Warehouse",
                "quantity": txn.quantity,
                "reason": txn.reason,
                "loss_value": float(txn.loss_value) if txn.loss_value else 0,
                "reference_action_id": txn.reference_action_id,
                "created_at": txn.created_at.isoformat() if txn.created_at else None,
            })

        return {"total": total, "history": history}
    except Exception as e:
        traceback.print_exc()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


# ── Trigger Health Scan ──────────────────────────────────────────────

@router.post("/run-health-scan", response_model=ScanResultResponse)
async def run_health_scan(db: AsyncSession = Depends(get_db)):
    """
    Manually trigger a full inventory health scan.
    Resolves old statuses, runs all 3 detectors, generates suggestions.
    """
    async with db.begin():
        result = await ActionSuggestionEngine.run_full_scan(db)
    return ScanResultResponse(**result)


# ── Configuration ────────────────────────────────────────────────────

@router.get("/optimization-config", response_model=ConfigResponse)
async def get_config(db: AsyncSession = Depends(get_db)):
    """Read current optimization configuration."""
    config = await InventoryHealthService.get_or_create_config(db)
    return ConfigResponse.model_validate(config)


@router.put("/optimization-config", response_model=ConfigResponse)
async def update_config(
    payload: ConfigUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update optimization configuration thresholds and automation flags."""
    async with db.begin():
        config = await InventoryHealthService.update_config(
            db, payload.model_dump(exclude_unset=True)
        )
    return ConfigResponse.model_validate(config)


# ── Manual Bundle Creation ───────────────────────────────────────────

@router.post("/manual-bundle", response_model=ManualBundleResponse)
async def create_manual_bundle(
    payload: ManualBundleCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Manager creates a bundle manually.
    Optionally links to an existing health suggestion.
    """
    async with db.begin():
        bundle = await ActionSuggestionEngine.create_manual_bundle(
            db,
            bundle_name=payload.bundle_name,
            bundle_price=payload.bundle_price,
            items=[item.model_dump() for item in payload.items],
            linked_suggestion_id=payload.linked_suggestion_id,
        )
    return ManualBundleResponse(
        id=bundle.id,
        bundle_name=bundle.bundle_name,
        bundle_price=float(bundle.bundle_price),
        is_active=bundle.is_active,
        linked_suggestion_id=payload.linked_suggestion_id,
        created_at=bundle.created_at,
    )


# ── Bundles Fetching ──────────────────────────────────────────────────

@router.get("/bundles", response_model=list[BundleResponse])
async def get_bundles(db: AsyncSession = Depends(get_db)):
    """Fetch all bundles and their items with product names."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.bundle import Bundle, BundleItem
    
    stmt = (
        select(Bundle)
        .options(selectinload(Bundle.items).selectinload(BundleItem.product))
        .order_by(Bundle.created_at.desc())
    )
    result = await db.execute(stmt)
    bundles = result.scalars().all()
    
    response = []
    for b in bundles:
        response.append(BundleResponse(
            id=b.id,
            bundle_name=b.bundle_name,
            bundle_price=float(b.bundle_price),
            is_active=b.is_active,
            created_at=b.created_at,
            items=[{
                "product_id": item.product_id,
                "product_name": item.product.name if item.product else f"Product #{item.product_id}",
                "quantity": item.quantity,
            } for item in b.items]
        ))
    return response


@router.patch("/bundles/{bundle_id}/status", response_model=BundleResponse)
async def update_bundle_status(
    bundle_id: int,
    payload: BundleStatusUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update the active status of a bundle."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.bundle import Bundle, BundleItem
    from fastapi import HTTPException
    
    async with db.begin():
        stmt = (
            select(Bundle)
            .where(Bundle.id == bundle_id)
            .options(selectinload(Bundle.items).selectinload(BundleItem.product))
        )
        result = await db.execute(stmt)
        bundle = result.scalars().first()
        
        if not bundle:
            raise HTTPException(status_code=404, detail="Bundle not found")
            
        bundle.is_active = payload.is_active
        
    return BundleResponse(
        id=bundle.id,
        bundle_name=bundle.bundle_name,
        bundle_price=float(bundle.bundle_price),
        is_active=bundle.is_active,
        created_at=bundle.created_at,
        items=[{
            "product_id": item.product_id,
            "product_name": item.product.name if item.product else f"Product #{item.product_id}",
            "quantity": item.quantity,
        } for item in bundle.items]
    )


@router.get("/bundles/sales", response_model=list[BundleSaleResponse])
async def get_bundle_sales(db: AsyncSession = Depends(get_db)):
    """Fetch all recorded bundle sales including the order number."""
    from app.models.bundle import BundleSale, Bundle
    from app.models.orders import SalesOrder
    from sqlalchemy import select
    
    stmt = (
        select(BundleSale, Bundle, SalesOrder)
        .join(Bundle, BundleSale.bundle_id == Bundle.id)
        .join(SalesOrder, BundleSale.sales_order_id == SalesOrder.id)
        .order_by(BundleSale.created_at.desc())
    )
    result = await db.execute(stmt)
    
    response = []
    for sale, bundle, order in result.all():
        response.append(BundleSaleResponse(
            id=sale.id,
            bundle_id=sale.bundle_id,
            bundle_name=bundle.bundle_name,
            sales_order_id=sale.sales_order_id,
            order_number=order.order_number,
            quantity=sale.quantity,
            created_at=sale.created_at,
        ))
    return response

@router.delete("/bundles/{bundle_id}")
async def delete_bundle(
    bundle_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a bundle and its items."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.bundle import Bundle, BundleItem
    from fastapi import HTTPException
    
    async with db.begin():
        stmt = select(Bundle).where(Bundle.id == bundle_id).options(selectinload(Bundle.items))
        result = await db.execute(stmt)
        bundle = result.scalars().first()
        
        if not bundle:
            raise HTTPException(status_code=404, detail="Bundle not found")
            
        await db.delete(bundle)
        
    return {"message": "Bundle deleted successfully"}

# ── Promotions Fetching ────────────────────────────────────────────────

@router.get("/promotions", response_model=list[PromotionResponse])
async def get_promotions(db: AsyncSession = Depends(get_db)):
    """Fetch all active and past promotions (discounts)."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.promotion import Promotion
    from app.models.products import Product
    
    stmt = (
        select(Promotion)
        .options(selectinload(Promotion.product))
        .order_by(Promotion.created_at.desc())
    )
    result = await db.execute(stmt)
    promotions = result.scalars().all()
    
    response = []
    for p in promotions:
        response.append(PromotionResponse(
            id=p.id,
            name=p.name,
            product_id=p.product_id,
            product_name=p.product.name if p.product else f"Product #{p.product_id}",
            discount_type=p.discount_type.value if hasattr(p.discount_type, 'value') else str(p.discount_type),
            discount_value=float(p.discount_value),
            min_quantity=p.min_quantity,
            valid_from=p.valid_from,
            valid_until=p.valid_until,
            is_active=p.is_active,
            approval_status=p.approval_status.value if hasattr(p.approval_status, 'value') else str(p.approval_status),
            created_at=p.created_at,
        ))
    return response

@router.patch("/promotions/{promo_id}/status", response_model=PromotionResponse)
async def update_promotion_status(
    promo_id: int,
    payload: PromotionStatusUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update the active status of a promotion."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.promotion import Promotion
    from app.models.products import Product
    from fastapi import HTTPException
    
    async with db.begin():
        stmt = (
            select(Promotion)
            .where(Promotion.id == promo_id)
            .options(selectinload(Promotion.product))
        )
        result = await db.execute(stmt)
        promo = result.scalars().first()
        
        if not promo:
            raise HTTPException(status_code=404, detail="Promotion not found")
            
        promo.is_active = payload.is_active
        
    return PromotionResponse(
        id=promo.id,
        name=promo.name,
        product_id=promo.product_id,
        product_name=promo.product.name if promo.product else f"Product #{promo.product_id}",
        discount_type=promo.discount_type.value if hasattr(promo.discount_type, 'value') else str(promo.discount_type),
        discount_value=float(promo.discount_value),
        min_quantity=promo.min_quantity,
        valid_from=promo.valid_from,
        valid_until=promo.valid_until,
        is_active=promo.is_active,
        approval_status=promo.approval_status.value if hasattr(promo.approval_status, 'value') else str(promo.approval_status),
        created_at=promo.created_at,
    )

@router.delete("/promotions/{promo_id}")
async def delete_promotion(
    promo_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a promotion."""
    from sqlalchemy import select
    from app.models.promotion import Promotion
    from fastapi import HTTPException
    
    async with db.begin():
        stmt = select(Promotion).where(Promotion.id == promo_id)
        result = await db.execute(stmt)
        promo = result.scalars().first()
        
        if not promo:
            raise HTTPException(status_code=404, detail="Promotion not found")
            
        await db.delete(promo)
        
    return {"message": "Promotion deleted successfully"}

