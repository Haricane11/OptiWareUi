import asyncio
from datetime import datetime, timezone
from sqlalchemy.future import select
from app.core.database import async_session_factory
from app.models.inventory_health_analytics import InventoryHealthAnalytics
from app.models.inventory import Inventory
from app.models.products import Product
from app.models.demand_analytics import ProductDemandAnalytics

async def check():
    async with async_session_factory() as db:
        stmt = select(Product).where(Product.status == "ACTIVE").order_by(Product.id).limit(10)
        prods = (await db.execute(stmt)).scalars().all()
        
        for p in prods:
            inv = (await db.execute(select(Inventory).where(Inventory.product_id == p.id).limit(1))).scalar_one_or_none()
            if inv:
                print(f"Prod {p.id} Inv: qty={inv.quantity}, age={(datetime.now(timezone.utc).date() - inv.received_date).days}")
            else:
                print(f"Prod {p.id} Inv: MISSING")
            
            da = (await db.execute(select(ProductDemandAnalytics).where(ProductDemandAnalytics.product_id == p.id))).scalar_one_or_none()
            if da:
                print(f"Prod {p.id} DA: add={da.average_daily_demand}")
            else:
                print(f"Prod {p.id} DA: MISSING")

asyncio.run(check())
