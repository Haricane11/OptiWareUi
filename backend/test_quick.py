"""Targeted debug test to capture traceback accurately."""
import traceback

try:
    from app.core.database import async_session_factory
    from app.models import *  # noqa
    from app.models.warehouse import Warehouse
    from sqlalchemy import select
    import asyncio
    
    async def test():
        async with async_session_factory() as db:
            result = await db.execute(select(Warehouse.id, Warehouse.name))
            print(result.all())
    
    asyncio.run(test())
except Exception as e:
    with open("error_trace.txt", "w", encoding="utf-8") as f:
        traceback.print_exc(file=f)
