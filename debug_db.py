import psycopg2
from psycopg2.extras import RealDictCursor

DB_CONFIG = {
    "host": "localhost",
    "database": "optiware",
    "user": "postgres",
    "password": "yngWIE500!",
    "port": "5432"
}

def debug_db():
    conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
    cur = conn.cursor()
    try:
        print("--- Users ---")
        cur.execute("SELECT * FROM users")
        for u in cur.fetchall():
            print(u)
        
        print("\n--- Warehouses ---")
        cur.execute("SELECT id, name, created_by FROM warehouses")
        for w in cur.fetchall():
            print(w)

    except Exception as e:
        print(f"Error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    debug_db()
