import asyncio
import sys
from app.core.database import async_session_factory
from app.services.inventory_classification_service import InventoryClassificationService

async def run():
    async with async_session_factory() as db:
        print("Starting batch recalculation of inventory health...")
        results = await InventoryClassificationService.compute_all_inventory_health(db)
        print("Results:", results)
        
        print("\nFetching specific product health (e.g., product 1)...")
        single = await InventoryClassificationService.get_classification(db, 1)
        print("Product 1:", single)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run())
