import asyncio
from sqlalchemy.future import select
from sqlalchemy import func
from app.core.database import async_session_factory
from app.models.inventory_health_analytics import InventoryHealthAnalytics

async def check():
    async with async_session_factory() as db:
        stmt = select(
            InventoryHealthAnalytics.classification, 
            func.count(InventoryHealthAnalytics.product_id)
        ).group_by(InventoryHealthAnalytics.classification)
        res = (await db.execute(stmt)).all()
        for classification, count in res:
            print(f"{classification}: {count}")

asyncio.run(check())
