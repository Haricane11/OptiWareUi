"""Create 2 sample bundle sales by linking existing bundles to existing sales orders."""
import asyncio
from sqlalchemy import select, func
from app.core.database import async_session_factory
from app.models.bundle import Bundle, BundleSale
from app.models.orders import SalesOrder

async def seed_sales():
    async with async_session_factory() as db:
        # Pick 2 active bundles (or any bundles)
        bundles_result = await db.execute(
            select(Bundle).where(Bundle.is_active == True).limit(2)
        )
        bundles = bundles_result.scalars().all()
        if len(bundles) < 2:
            # Fallback to any bundles
            bundles_result = await db.execute(select(Bundle).limit(2))
            bundles = bundles_result.scalars().all()

        if len(bundles) < 2:
            print("Not enough bundles in DB. Aborting.")
            return

        # Pick 2 sales orders
        orders_result = await db.execute(select(SalesOrder).limit(2))
        orders = orders_result.scalars().all()
        if len(orders) < 2:
            print("Not enough sales orders. Creating one...")
            from app.models.customer import Customer
            from app.models.warehouse import Warehouse
            from datetime import date

            cust = (await db.execute(select(Customer).limit(1))).scalar_one_or_none()
            wh = (await db.execute(select(Warehouse).limit(1))).scalar_one_or_none()
            if not cust or not wh:
                print("No customer or warehouse found. Aborting.")
                return

            so1 = SalesOrder(order_number="SO-BUNDLE-001", customer_id=cust.id, warehouse_id=wh.id, status="CREATED", order_date=date.today())
            so2 = SalesOrder(order_number="SO-BUNDLE-002", customer_id=cust.id, warehouse_id=wh.id, status="CREATED", order_date=date.today())
            db.add_all([so1, so2])
            await db.flush()
            orders = [so1, so2]

        # Create bundle sales
        sale1 = BundleSale(bundle_id=bundles[0].id, sales_order_id=orders[0].id, quantity=3)
        sale2 = BundleSale(bundle_id=bundles[1].id, sales_order_id=orders[-1].id, quantity=1)
        db.add_all([sale1, sale2])
        await db.commit()

        print(f"Created 2 bundle sales:")
        print(f"  Bundle '{bundles[0].bundle_name}' x3 → Order {orders[0].order_number}")
        print(f"  Bundle '{bundles[1].bundle_name}' x1 → Order {orders[-1].order_number}")
        print("Done!")

if __name__ == "__main__":
    asyncio.run(seed_sales())
