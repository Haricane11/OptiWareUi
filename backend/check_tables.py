import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import engine
from sqlalchemy import text

async def check_shelves():
    async with engine.connect() as conn:
        print("--- Tables in public schema ---")
        res = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
        print(f"Tables: {[r[0] for r in res.all()]}")
        
        print("\n--- Columns in 'shelves' table ---")
        res = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'shelves'"))
        print(f"Columns: {[r[0] for r in res.all()]}")

if __name__ == "__main__":
    asyncio.run(check_shelves())
