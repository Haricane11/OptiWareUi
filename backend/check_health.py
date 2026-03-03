import asyncio
from sqlalchemy.future import select
from app.core.database import async_session_factory
from app.models.inventory_health_analytics import InventoryHealthAnalytics
from app.models.products import Product

async def check_health():
    async with async_session_factory() as db:
        stmt = select(Product.id).where(Product.status == "ACTIVE").order_by(Product.id).limit(10)
        prods = (await db.execute(stmt)).scalars().all()
        
        for pid in prods:
            da = (await db.execute(select(InventoryHealthAnalytics).where(InventoryHealthAnalytics.product_id == pid))).scalar_one_or_none()
            if da:
                print(f"Prod {pid} Health: class={da.classification}, score={da.dead_stock_severity_score}, days_since_last_sale={da.days_since_last_sale}, age={da.inventory_age_days}")
            else:
                print(f"Prod {pid} Health: MISSING")

asyncio.run(check_health())
