import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy.future import select
from sqlalchemy import update, delete
from app.core.database import async_session_factory
from app.models.products import Product
from app.models.inventory import Inventory
from app.models.demand_analytics import ProductDemandAnalytics

async def seed_real_data():
    today = datetime.now(timezone.utc).date()
    
    async with async_session_factory() as db:
        try:
            # 1. Get 25 ACTIVE products
            stmt = select(Product).where(Product.status == "ACTIVE").limit(25)
            products = (await db.execute(stmt)).scalars().all()
            
            for i, p in enumerate(products):
                if i < 20:
                    age_days = 65
                    qty = 10
                    demand = 1.0 # 90-day demand = 90
                else:
                    age_days = 150
                    qty = 200
                    demand = 0.05 # 90-day demand = 4.5
                    
                # Update the existing inventory safely
                inv_stmt = select(Inventory).where(Inventory.product_id == p.id).limit(1)
                inv = (await db.execute(inv_stmt)).scalar_one_or_none()
                
                if inv:
                    inv.received_date = today - timedelta(days=age_days)
                    inv.available = qty
                    inv.quantity = qty
                else:
                    inv = Inventory(
                        product_id=p.id,
                        warehouse_id=1,
                        batch_number=f"SIM-{p.id}",
                        quantity=qty,
                        available=qty,
                        status="ACTIVE",
                        received_date=today - timedelta(days=age_days)
                    )
                    db.add(inv)
                
                # Delete old demand analytics
                await db.execute(delete(ProductDemandAnalytics).where(ProductDemandAnalytics.product_id == p.id))
                
                # Insert carefully calculated demand
                db.add(ProductDemandAnalytics(
                    product_id=p.id,
                    average_daily_demand=demand,
                    demand_std_dev=demand * 0.5
                ))
            
            await db.commit()
            print("Successfully re-seeded backend tables to force SLOW_MOVING and DEAD stock!")
            
        except Exception as e:
            print(f"Error: {e}")
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(seed_real_data())
