import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(host='127.0.0.1', port=5433, dbname='wms', user='wms_user', password='root123', cursor_factory=RealDictCursor)
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position")
print("=== users table columns ===")
for r in cur.fetchall():
    print(r['column_name'])

# Also check if zones/floors tables exist
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('zones', 'floors')")
print("\n=== zones/floors tables ===")
for r in cur.fetchall():
    print(r['table_name'])

cur.close()
conn.close()
