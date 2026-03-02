"""Analytics router — financial integrity and inventory analysis."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/turnover")
async def inventory_turnover(period_days: int = 30, db: AsyncSession = Depends(get_db)):
    return await AnalyticsService.calculate_inventory_turnover(db, period_days)


@router.get("/carrying-cost")
async def carrying_cost(holding_cost_rate: float = 0.2, db: AsyncSession = Depends(get_db)):
    return await AnalyticsService.calculate_carrying_cost(db, holding_cost_rate)


@router.get("/dead-stock")
async def dead_stock(threshold_days: int = 90, db: AsyncSession = Depends(get_db)):
    return await AnalyticsService.detect_dead_stock(db, threshold_days)


@router.get("/expiry-risk")
async def expiry_risk(threshold_days: int = 30, db: AsyncSession = Depends(get_db)):
    return await AnalyticsService.detect_expiry_risk(db, threshold_days)


@router.get("/financial-loss")
async def financial_loss(db: AsyncSession = Depends(get_db)):
    return await AnalyticsService.calculate_financial_loss(db)


@router.get("/recommendations")
async def recommendations(db: AsyncSession = Depends(get_db)):
    return await AnalyticsService.get_recommendations(db)


from app.schemas import ProductLogisticsMetricsResponse

@router.get("/logistics", response_model=list[ProductLogisticsMetricsResponse])
async def logistics_metrics(limit: int = 100, db: AsyncSession = Depends(get_db)):
    return await AnalyticsService.get_logistics_metrics(db, limit)
