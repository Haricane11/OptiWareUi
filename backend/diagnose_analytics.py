import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import async_session_factory
from sqlalchemy import select
from app.models.inventory_health import InventoryHealthStatus
from app.models.inventory_health_analytics import InventoryHealthAnalytics, HealthClassification
from app.models.products import Product

async def diagnose():
    async with async_session_factory() as session:
        print("Testing stmt_analytics...")
        stmt = (
            select(InventoryHealthAnalytics, Product)
            .join(Product, Product.id == InventoryHealthAnalytics.product_id)
            .where(
                InventoryHealthAnalytics.classification.in_([
                    HealthClassification.DEAD, 
                    HealthClassification.DORMANT,
                    HealthClassification.SLOW_MOVING
                ])
            )
        )
        try:
            result = await session.execute(stmt)
            print("Successfully executed stmt_analytics. Fetching rows...")
            rows = result.all()
            print(f"Analytics rows fetched: {len(rows)}")
        except Exception as e:
            print(f"FAILED stmt_analytics: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(diagnose())
