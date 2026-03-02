import psycopg2

conn = psycopg2.connect(host='127.0.0.1', port=5433, dbname='wms', user='wms_user', password='root123')
cur = conn.cursor()

# Add missing column to sales_orders
try:
    cur.execute("ALTER TABLE sales_orders ADD COLUMN expected_delivery_date DATE")
    print("Added expected_delivery_date to sales_orders")
    conn.commit()
except Exception as e:
    conn.rollback()
    print(f"sales_orders: {e}")

# Check if warehouses has a 'name' column (router references w.name)
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'warehouses'")
wh_cols = [r[0] for r in cur.fetchall()]
print(f"warehouses columns: {wh_cols}")

# Check if customers has 'customer_name' column
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'customers'")
cust_cols = [r[0] for r in cur.fetchall()]
print(f"customers columns: {cust_cols}")

# Check if products has 'unit_price' column
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'products'")
prod_cols = [r[0] for r in cur.fetchall()]
print(f"products columns: {prod_cols}")

cur.close()
conn.close()
