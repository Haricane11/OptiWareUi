import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(host='127.0.0.1', port=5433, dbname='wms', user='wms_user', password='root123', cursor_factory=RealDictCursor)
cur = conn.cursor()
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
print("=== All tables in DB ===")
for r in cur.fetchall():
    print(f"  {r['table_name']}")
cur.close()
conn.close()
