import psycopg2
import sys

DATABASE_URL = "postgresql://wms_user:root123@127.0.0.1:5433/wms"

def migrate():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        print("Checking for bundle_id column...")
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='sales_order_items' AND column_name='bundle_id'")
        if cur.fetchone():
            print("Column bundle_id already exists.")
        else:
            print("Adding bundle_id column...")
            cur.execute("ALTER TABLE sales_order_items ADD COLUMN bundle_id INTEGER")
            conn.commit()
            print("Column bundle_id added successfully.")
        
        # Verify
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='sales_order_items' AND column_name='bundle_id'")
        if cur.fetchone():
            print("Verification successful: bundle_id column found.")
        else:
            print("Verification failed: bundle_id column NOT found.")
            sys.exit(1)
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error during migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
