import psycopg2
from psycopg2.extras import RealDictCursor

DB_CONFIG = {
    "host": "localhost",
    "database": "optiware",
    "user": "postgres",
    "password": "yngWIE500!",
    "port": "5432"
}

def check_schema():
    conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
    cur = conn.cursor()
    try:
        print("Checking users table schema...")
        cur.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users';")
        cols = cur.fetchall()
        for c in cols:
            print(c)
        
        if not cols:
            print("Table 'users' does not exist.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    check_schema()
