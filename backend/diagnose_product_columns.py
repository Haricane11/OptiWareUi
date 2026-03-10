import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import async_session_factory
from sqlalchemy import select
from app.models.products import Product

async def diagnose():
    async with async_session_factory() as session:
        mapper = Product.__mapper__
        for column in mapper.columns:
            print(f"Testing Column: {column.key} ({column.type})")
            try:
                stmt = select(getattr(Product, column.key)).limit(1)
                result = await session.execute(stmt)
                result.all()
                print(f"  {column.key} SUCCESS")
            except Exception as e:
                print(f"  {column.key} FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(diagnose())
