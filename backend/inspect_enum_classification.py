import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import engine
from sqlalchemy import text

async def check_schema():
    async with engine.connect() as conn:
        print("--- Metadata Check for health_classification_enum ---")
        res = await conn.execute(text("""
            SELECT typname, oid, nspname 
            FROM pg_type 
            WHERE typname = 'health_classification_enum'
        """))
        for row in res.all():
            print(f"Enum: {row.typname} | OID: {row.oid} | Namespace: {row.nspname}")
            
        print("\n--- Enum Values ---")
        res = await conn.execute(text("""
            SELECT enumlabel 
            FROM pg_enum 
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'health_classification_enum')
            ORDER BY enumsortorder
        """))
        print(f"Values: {[r[0] for r in res.all()]}")

if __name__ == "__main__":
    asyncio.run(check_schema())
