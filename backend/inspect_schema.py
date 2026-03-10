import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import engine
from sqlalchemy import text

async def check_schema():
    async with engine.connect() as conn:
        print("--- Detailed Metadata Check for inventory_health_status ---")
        res = await conn.execute(text("""
            SELECT 
                a.attname as col,
                t.typname as type,
                a.atttypid as oid
            FROM pg_attribute a 
            JOIN pg_class c ON a.attrelid = c.oid 
            JOIN pg_type t ON a.atttypid = t.oid 
            WHERE c.relname = 'inventory_health_status' 
            AND a.attnum > 0
            ORDER BY a.attnum
        """))
        for row in res.all():
            print(f"Col: {row.col:20} | Type: {row.type:15} | OID: {row.oid}")

if __name__ == "__main__":
    asyncio.run(check_schema())
