import psycopg2

# Database connection configuration
DB_CONFIG = {
    "host": "localhost",
    "database": "optiware",
    "user": "postgres",
    "password": "yngWIE500!",
    "port": "5432"
}

def check_users():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    try:
        # Check current users and their password column
        cur.execute("SELECT id, username, role, warehouse_id, status, LENGTH(password) as pwd_len FROM users")
        users = cur.fetchall()
        print("Current users in database:")
        print(f"{'ID':<5} {'Username':<15} {'Role':<10} {'Warehouse':<10} {'Status':<10} {'Pwd Len':<10}")
        print("-" * 70)
        for user in users:
            print(f"{user[0]:<5} {user[1]:<15} {user[2]:<10} {str(user[3]):<10} {str(user[4]):<10} {user[5]:<10}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    check_users()
