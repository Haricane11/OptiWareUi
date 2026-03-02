import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(host='127.0.0.1', port=5433, dbname='wms', user='wms_user', password='root123', cursor_factory=RealDictCursor)
cur = conn.cursor()

for table in ['sales_orders', 'sales_order_items', 'delivery_notes', 'delivery_note_items']:
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}' ORDER BY ordinal_position")
    cols = [r['column_name'] for r in cur.fetchall()]
    print(f"\n{table}:")
    for c in cols:
        print(f"  - {c}")

cur.close()
conn.close()
