import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import async_session_factory
from sqlalchemy import select
from app.models.inventory_health import InventoryHealthStatus

async def diagnose():
    async with async_session_factory() as session:
        print("Testing select(InventoryHealthStatus) for ALL rows")
        stmt = select(InventoryHealthStatus)
        try:
            result = await session.execute(stmt)
            print("Successfully executed query. Fetching scalars...")
            rows = result.scalars().all()
            print(f"Scalars fetched: {len(rows)}")
            for i, r in enumerate(rows):
                print(f"Row {i}: id={r.id}, severity={r.severity_score}, type={r.health_type}")
        except Exception as e:
            print(f"FAILED: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(diagnose())
