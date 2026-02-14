import psycopg2
from psycopg2.extras import RealDictCursor

DB_CONFIG = {
    "host": "localhost",
    "database": "optiware",
    "user": "postgres",
    "password": "yngWIE500!",
    "port": "5432"
}

def check_tables():
    conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
    cur = conn.cursor()
    try:
        # Check all tables
        cur.execute("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';")
        tables = cur.fetchall()
        print("Tables in database:")
        for t in tables:
            print(f"- {t['tablename']}")
            # Check columns
            cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t['tablename']}';")
            cols = cur.fetchall()
            for c in cols:
                print(f"  * {c['column_name']} ({c['data_type']})")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    check_tables()
