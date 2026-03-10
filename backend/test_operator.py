import asyncio
import sys
import os
sys.path.insert(0, os.getcwd())
from app.core.database import engine
from sqlalchemy import text

async def main():
    async with engine.connect() as conn:
        print("Testing operator for health_type_enum...")
        try:
            # Try to compare exactly like SQLAlchemy does
            res = await conn.execute(text(
                "SELECT 'DEAD'::health_type_enum = ANY(ARRAY['DEAD', 'SLOW']::health_type_enum[])"
            ))
            print(f"Comparison 1: {res.fetchone()}")
            
            res = await conn.execute(text(
                "SELECT * FROM inventory_health_status WHERE health_type IN ('DEAD', 'SLOW') LIMIT 1"
            ))
            print("Comparison 2: SUCCESS")
        except Exception as e:
            print(f"Operator Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
