import asyncio
from sqlalchemy.future import select
from app.core.database import async_session_factory
from app.models.inventory import Inventory

async def check_all():
    async with async_session_factory() as db:
        res = await db.execute(select(Inventory).where(Inventory.product_id == 4284))
        invs = res.scalars().all()
        for i in invs:
            print(f"Prod 4284 Inv: id={i.id}, qty={i.quantity}, rec={i.received_date}")

asyncio.run(check_all())
