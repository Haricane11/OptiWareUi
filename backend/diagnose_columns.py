import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import engine
from sqlalchemy import select, text
from app.models.inventory_health import InventoryHealthStatus

async def diagnose():
    async with engine.connect() as conn:
        cols = ["id", "product_id", "warehouse_id", "batch_id", "health_type", "severity_score", "details", "detected_at", "resolved_at"]
        for col_name in cols:
            print(f"Testing Column: {col_name}")
            try:
                # We use a raw select but through SQLAlchemy type system
                col_obj = getattr(InventoryHealthStatus, col_name)
                stmt = select(col_obj).limit(1)
                res = await conn.execute(stmt)
                res.all()
                print(f"  {col_name} SUCCESS")
            except Exception as e:
                print(f"  {col_name} FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(diagnose())
