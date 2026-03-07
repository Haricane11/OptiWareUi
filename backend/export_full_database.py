import json
import datetime
from decimal import Decimal
from app.mongodb import get_conn

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError ("Type %s not serializable" % type(obj))

def export_db():
    conn = get_conn()
    cur = conn.cursor()
    
    # Get all tables
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name != 'alembic_version'")
    tables = [list(r.values())[0] for r in cur.fetchall()]
    
    # Order tables to handle foreign keys (simplified)
    # Products and Customers should come first
    priority = ['products', 'customers', 'suppliers', 'warehouses', 'floors', 'zones', 'areas', 'shelves']
    tables = [t for t in priority if t in tables] + [t for t in tables if t not in priority]
    
    seed_data = {}
    
    for table in tables:
        print(f"Exporting {table}...")
        cur.execute(f"SELECT * FROM {table}")
        rows = cur.fetchall()
        # Convert RealDictRow to regular list of dicts
        seed_data[table] = [dict(r) for r in rows]
        
    # Write to a Python seed script
    with open('full_db_seed.py', 'w', encoding='utf-8') as f:
        f.write("from app.mongodb import get_conn\n")
        f.write("import datetime\n")
        f.write("from decimal import Decimal\n\n")
        f.write("DATA = " + json.dumps(seed_data, default=json_serial, indent=2) + "\n\n")
        f.write("""
def seed():
    conn = get_conn()
    cur = conn.cursor()
    
    for table, rows in DATA.items():
        if not rows:
            continue
            
        print(f"Seeding {table}...")
        columns = rows[0].keys()
        
        # Build the INSERT statement
        col_names = ", ".join(columns)
        placeholders = ", ".join(["%s"] * len(columns))
        
        insert_query = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
        
        for row in rows:
            # Convert ISO dates back to objects
            values = []
            for col in columns:
                val = row[col]
                # Try to parse date strings (naive approach)
                if isinstance(val, str) and len(val) >= 10:
                    try:
                        if len(val) == 10:
                            val = datetime.datetime.strptime(val, '%Y-%m-%d').date()
                        else:
                            val = datetime.datetime.fromisoformat(val.replace('Z', '+00:00'))
                    except:
                        pass
                values.append(val)
            
            try:
                cur.execute(insert_query, tuple(values))
            except Exception as e:
                print(f"Error seeding {table}: {e}")
                
    conn.commit()
    cur.close()
    conn.close()
    print("Seeding complete!")

if __name__ == '__main__':
    seed()
""")

    print(f"Exported {len(tables)} tables to full_db_seed.py")
    cur.close()
    conn.close()

if __name__ == '__main__':
    export_db()
