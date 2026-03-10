import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from app.core.database import engine
from sqlalchemy import inspect, text
from app.models.products import Product
from app.models.inventory_health import InventoryHealthStatus
from app.models.inventory_health_analytics import InventoryHealthAnalytics
from app.models.reorder_policy import ReorderPolicy
from app.models.inventory import Inventory
from app.models.warehouse import Warehouse, Floor, Area, Zone, Shelf

async def scan():
    models = [
        ("products", Product),
        ("inventory_health_status", InventoryHealthStatus),
        ("inventory_health_analytics", InventoryHealthAnalytics),
        ("reorder_policy", ReorderPolicy),
        ("inventory", Inventory),
        ("warehouses", Warehouse),
        ("floors", Floor),
        ("areas", Area),
        ("zones", Zone),
        ("shelves", Shelf)
    ]
    
    async with engine.connect() as conn:
        for table_name, model in models:
            print(f"\n--- Scanning {table_name} ---")
            db_cols = {}
            res = await conn.execute(text(f"""
                SELECT a.attname, t.typname, a.atttypid 
                FROM pg_attribute a 
                JOIN pg_class c ON a.attrelid = c.oid 
                JOIN pg_type t ON a.atttypid = t.oid 
                WHERE c.relname = '{table_name}' AND a.attnum > 0
            """))
            for row in res.all():
                db_cols[row[0]] = (row[1], row[2])
                
            mapper = inspect(model)
            for column in mapper.columns:
                model_type = str(column.type)
                db_info = db_cols.get(column.key)
                if db_info:
                    db_type, db_oid = db_info
                    if "NUMERIC" in model_type.upper():
                        print(f"  {column.key:25} | Model: {model_type:15} | DB: {db_type:10} | OID: {db_oid}")
                        if db_oid == 1043:
                            print(f"  !!! MISMATCH FOUND: {table_name}.{column.key} is VARCHAR in DB")
                else:
                    # Skip columns not in DB if likely deferred or handled otherwise
                    pass

if __name__ == "__main__":
    asyncio.run(scan())
