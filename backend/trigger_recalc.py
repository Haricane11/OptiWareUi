import asyncio
from app.core.database import async_session_factory
from app.services.inventory_classification_service import InventoryClassificationService

async def trigger():
    try:
        async with async_session_factory() as db:
            async with db.begin():
                await InventoryClassificationService.compute_all_inventory_health(db)
    except Exception as e:
        import traceback
        with open("error3.txt", "w") as f:
            f.write(traceback.format_exc())
            f.write("\n\n" + str(e))
        print("Error caught and written to error3.txt")

asyncio.run(trigger())
