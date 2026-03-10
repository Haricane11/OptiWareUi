import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import async_session_factory
from sqlalchemy import select
from app.models.inventory_health_analytics import InventoryHealthAnalytics
from app.models.products import Product

async def diagnose():
    async with async_session_factory() as session:
        print("Testing select(Product)...")
        try:
            stmt = select(Product).limit(1)
            res = await session.execute(stmt)
            res.scalars().all()
            print("  select(Product) SUCCESS")
        except Exception as e:
            print(f"  select(Product) FAILED: {e}")

        print("\nTesting select(InventoryHealthAnalytics)...")
        try:
            stmt = select(InventoryHealthAnalytics).limit(1)
            res = await session.execute(stmt)
            res.scalars().all()
            print("  select(InventoryHealthAnalytics) SUCCESS")
        except Exception as e:
            print(f"  select(InventoryHealthAnalytics) FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(diagnose())
