import asyncio
from app.core.database import async_session_factory
from sqlalchemy import select
from app.models.inventory_health import InventoryHealthStatus

async def main():
    async with async_session_factory() as db:
        pids = [4448, 4450, 4438, 4406, 4442, 4699]
        stmt = select(InventoryHealthStatus).where(
            InventoryHealthStatus.product_id.in_(pids),
            InventoryHealthStatus.resolved_at.is_(None)
        )
        res = await db.execute(stmt)
        for hs in res.scalars():
            print(f"Product {hs.product_id} has HealthType: {hs.health_type}")

asyncio.run(main())
