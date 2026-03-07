import asyncio
from sqlalchemy import select, func
from app.core.database import async_session_factory
from app.models.inventory_health import InventoryHealthStatus, HealthType

async def check_count():
    async with async_session_factory() as db:
        stmt = select(func.count(InventoryHealthStatus.id)).where(InventoryHealthStatus.health_type == HealthType.LOW)
        count = await db.scalar(stmt)
        print("Count in DB:", count)

if __name__ == "__main__":
    asyncio.run(check_count())
