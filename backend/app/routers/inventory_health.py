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
    PromotionStatusUpdateRequest,
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
        total_issues=report["total_issues"],
        dead_stock_count=report["dead_stock_count"],
        slow_moving_count=report["slow_moving_count"],
        expiry_risk_count=report["expiry_risk_count"],
        low_stock_count=report.get("low_stock_count", 0),
        total_value_at_risk=report["total_value_at_risk"],
        dead_stock_items=[
            HealthStatusItem.model_validate(s) for s in report["dead_stock_items"]
        ],
        slow_moving_items=[
            HealthStatusItem.model_validate(s) for s in report["slow_moving_items"]
        ],
        expiry_risk_items=[
            HealthStatusItem.model_validate(s) for s in report["expiry_risk_items"]
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


@router.post("/execute-action/{suggestion_id}", response_model=ActionSuggestionResponse)
async def execute_action(
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Mark an approved suggestion as executed."""
    async with db.begin():
        suggestion = await ActionSuggestionEngine.execute_action(db, suggestion_id)
    return ActionSuggestionResponse.model_validate(suggestion)


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

