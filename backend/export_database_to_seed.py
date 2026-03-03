import asyncio
import json
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import text
from app.core.database import async_session_factory

# Tables in order of insertion (handling foreign key dependencies)
TABLES = [
    "warehouses",
    "floors",
    "areas",
    "zones",
    "users",
    "shelf_types",
    "shelves",
    "suppliers",
    "products",
    "reorder_policy",
    "purchase_orders",
    "purchase_order_items",
    "receipts",
    "receipt_items",
    "placement_suggestions",
    "inventory",
    "product_demand_analytics",
    "product_logistics_metrics",
    "inventory_health_analytics",
    "inventory_optimization_config",
    "inventory_health_status",
    "inventory_action_suggestions",
    "customers",
    "sales_orders",
    "sales_order_items",
    "delivery_notes",
    "delivery_note_items",
    "bundles",
    "bundle_items",
    "bundle_sales",
    "promotions",
    "picking_allocations"
]

def format_value(val):
    if val is None:
        return "None"
    elif isinstance(val, (int, float)):
        return str(val)
    elif isinstance(val, Decimal):
        return str(float(val))
    elif isinstance(val, bool):
        return "True" if val else "False"
    elif isinstance(val, (datetime, date)):
        # For simplicity in seed scripts, we'll pass strings to the DB
        # The DB adapter handles parsing them back
        return f"'{val.isoformat()}'"
    elif isinstance(val, dict) or isinstance(val, list):
        # Convert JSON back to string for the raw SQL
        json_str = json.dumps(val).replace("'", "''")
        return f"'{json_str}'"
    elif isinstance(val, str):
        # Escape single quotes
        escaped = val.replace("'", "''")
        return f"'{escaped}'"
    else:
        return f"'{str(val)}'"

async def export():
    output_filename = "friend_seed.py"
    
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write('"""\n')
        f.write('Database Migration & Seed Script\n')
        f.write('Run this file to populate the database with exported data.\n')
        f.write('"""\n\n')
        f.write('import asyncio\n')
        f.write('from sqlalchemy import text\n')
        f.write('from app.core.database import async_session_factory\n\n')
        f.write('async def seed_data():\n')
        f.write('    async with async_session_factory() as db:\n')
        f.write('        async with db.begin():\n')
        
        # Clear existing data in reverse order to respect foreign keys
        f.write('            print("Clearing existing data...")\n')
        for table in reversed(TABLES):
            f.write(f'            await db.execute(text("TRUNCATE TABLE {table} CASCADE;"))\n')
        f.write('\n')

        async with async_session_factory() as db:
            for table in TABLES:
                print(f"Exporting {table}...")
                
                rows = []
                try:
                    res = await db.execute(text(f"SELECT * FROM {table} ORDER BY id ASC;"))
                    rows = res.mappings().fetchall()
                except Exception as e:
                    # rollback so the session can keep querying other tables
                    await db.rollback()
                    try:
                        res = await db.execute(text(f"SELECT * FROM {table};"))
                        rows = res.mappings().fetchall()
                    except Exception as e2:
                        await db.rollback()
                        print(f"Skipping {table}. Error: {e2}")
                        continue
                
                if not rows:
                    continue
                
                f.write(f'            print("Seeding {table}...")\n')
                
                # Generate INSERT statements
                columns = list(rows[0].keys())
                
                # Exclude GENERATED ALWAYS columns strictly based on name matches known
                excluded_cols = {"volume", "available_volume", "measured_volume", "available"}
                insert_cols = [c for c in columns if c not in excluded_cols]
                
                cols_str = ", ".join(insert_cols)
                
                for r in rows:
                    vals = [format_value(r[c]) for c in insert_cols]
                    vals_str = ", ".join(vals)
                    stmt = f'            await db.execute(text("INSERT INTO {table} ({cols_str}) VALUES ({vals_str});"))\n'
                    f.write(stmt)
                    
                # Fix sequence after insertions if ID exists
                if "id" in columns:
                    f.write(f'            await db.execute(text("SELECT setval(pg_get_serial_sequence(\'{table}\', \'id\'), COALESCE(MAX(id), 1) + 1, false) FROM {table};"))\n')
                f.write('\n')

        f.write('        print("Seed completed successfully!")\n\n')
        f.write('if __name__ == "__main__":\n')
        f.write('    asyncio.run(seed_data())\n')
        
    print(f"Successfully exported entire database to {output_filename}")

if __name__ == "__main__":
    asyncio.run(export())
