"""Demand analysis router — compute and query demand-driven reorder metrics."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import EntityNotFoundError
from app.schemas import (
    DemandMetricsResponse,
    DemandRecalculateResponse,
    DemandRecalculateAllResponse,
)
from app.services.demand_analysis_service import DemandAnalysisService
from app.models.demand_analytics import ProductDemandAnalytics
from sqlalchemy import select

router = APIRouter(prefix="/demand", tags=["Demand Analysis"])


@router.post(
    "/recalculate/{product_id}",
    response_model=DemandRecalculateResponse,
)
async def recalculate_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Recalculate demand metrics and reorder policy for a single product."""
    async with db.begin():
        result = await DemandAnalysisService.compute_reorder_policy(
            db, product_id,
        )
    return result


@router.post(
    "/recalculate-all",
    response_model=DemandRecalculateAllResponse,
)
async def recalculate_all(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Recalculate demand metrics for all products with a reorder policy."""
    async with db.begin():
        results = await DemandAnalysisService.recalculate_all_policies(db)
    return {"results": results}


@router.get(
    "/metrics",
    response_model=list[DemandMetricsResponse],
)
async def get_all_demand_metrics(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ProductDemandAnalytics).limit(limit)
    result = await db.execute(stmt)
    analytics = result.scalars().all()
    
    return [
        {
            "product_id": a.product_id,
            "average_daily_demand": float(a.average_daily_demand or 0),
            "demand_std_dev": float(a.demand_std_dev or 0),
            "window_days": a.window_days,
            "sample_size": a.sample_size,
            "last_updated": a.last_updated,
        }
        for a in analytics
    ]


@router.get(
    "/metrics/{product_id}",
    response_model=DemandMetricsResponse,
)
async def get_demand_metrics(
    product_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get the latest computed demand metrics for a product.

    Reads from the product_demand_analytics table (denormalized snapshot).
    """
    stmt = select(ProductDemandAnalytics).where(
        ProductDemandAnalytics.product_id == product_id,
    )
    result = await db.execute(stmt)
    analytics = result.scalar_one_or_none()

    if not analytics:
        raise EntityNotFoundError("ProductDemandAnalytics", product_id)

    return {
        "product_id": analytics.product_id,
        "average_daily_demand": float(analytics.average_daily_demand or 0),
        "demand_std_dev": float(analytics.demand_std_dev or 0),
        "window_days": analytics.window_days,
        "sample_size": analytics.sample_size,
        "last_updated": analytics.last_updated,
    }
