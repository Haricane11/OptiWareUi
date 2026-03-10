import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import engine
from sqlalchemy import text

async def fix_shelves():
    async with engine.connect() as conn:
        print("Adding can_store_hazardous to shelves...")
        try:
            await conn.execute(text("ALTER TABLE shelves ADD COLUMN IF NOT EXISTS can_store_hazardous BOOLEAN DEFAULT FALSE"))
            await conn.commit()
            print("Column added successfully.")
        except Exception as e:
            await conn.rollback()
            print(f"Error adding column: {e}")

if __name__ == "__main__":
    asyncio.run(fix_shelves())
