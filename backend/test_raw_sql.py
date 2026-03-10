import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import engine
from sqlalchemy import text

async def test_raw():
    async with engine.connect() as conn:
        print("Executing raw SQL: SELECT * FROM inventory_health_status LIMIT 1")
        try:
            res = await conn.execute(text("SELECT * FROM inventory_health_status LIMIT 1"))
            print(f"Result: {res.all()}")
            print("Raw SQL SUCCESS")
        except Exception as e:
            print(f"Raw SQL FAILED with: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_raw())
