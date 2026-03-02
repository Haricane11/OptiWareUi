import asyncio
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from app.core.database import async_session_factory
from app.models.inventory import Inventory
from app.models.products import Product
from app.models.inventory_health import InventoryHealthStatus

async def remove_expiry_dates():
    async with async_session_factory() as db:
        # Step 1: Find all non-perishable products
        # Let's say anything NOT 'Groceries' or 'Food' is non-perishable
        print("Finding non-perishable products...")
        stmt = select(Product).where(Product.category.notin_(["Groceries", "Food", "Beverages", "Perishables"]))
        result = await db.execute(stmt)
        products = result.scalars().all()
        
        non_perishable_ids = [p.id for p in products]
        print(f"Found {len(non_perishable_ids)} non-perishable products.")

        if not non_perishable_ids:
            return

        # Step 2: Remove expiry dates from inventory batches of these products
        print("Scrubbing expiry dates from inventory...")
        update_stmt = (
            update(Inventory)
            .where(Inventory.product_id.in_(non_perishable_ids))
            .where(Inventory.expiry_date.is_not(None))
            .values(expiry_date=None)
        )
        result = await db.execute(update_stmt)
        print(f"Removed expiry dates from {result.rowcount} inventory batches.")

        # Step 3: Delete invalid Expiry health flags
        print("Removing invalid expiry health alerts...")
        from app.models.inventory_health import HealthType
        
        # Find health statuses
        health_stmt = select(InventoryHealthStatus).where(
            InventoryHealthStatus.health_type == HealthType.EXPIRY,
            InventoryHealthStatus.product_id.in_(non_perishable_ids)
        )
        health_res = await db.execute(health_stmt)
        invalid_alerts = health_res.scalars().all()
        
        for alert in invalid_alerts:
            await db.delete(alert)
            
        print(f"Deleted {len(invalid_alerts)} invalid 'Expiry' health alerts.")

        await db.commit()
        print("Done!")

if __name__ == "__main__":
    asyncio.run(remove_expiry_dates())
