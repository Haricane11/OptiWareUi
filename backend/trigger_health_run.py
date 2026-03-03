import asyncio
from app.core.database import async_session_factory
from app.services.inventory_health_service import InventoryHealthService

async def trigger():
    try:
        async with async_session_factory() as db:
            async with db.begin():
                config = await InventoryHealthService.get_or_create_config(db)
                await InventoryHealthService.resolve_old_statuses(db)
                low = await InventoryHealthService.detect_low_stock(db, config)
                await InventoryHealthService.persist_statuses(db, low)
                print("Generated low stock records:", len(low))
    except Exception as e:
        import traceback
        with open("error_health.txt", "w") as f:
            f.write(traceback.format_exc())
            f.write("\n\n" + str(e))
        print("Error caught and written to error_health.txt")

asyncio.run(trigger())
