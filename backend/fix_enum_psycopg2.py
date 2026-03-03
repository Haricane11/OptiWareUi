import psycopg2

def fix_enum():
    conn = psycopg2.connect(
        dbname="wms",
        user="wms_user",
        password="root123",
        host="127.0.0.1",
        port="5433"
    )
    conn.autocommit = True
    cur = conn.cursor()
    
    try:
        cur.execute("ALTER TYPE recommended_action_enum ADD VALUE IF NOT EXISTS 'DISCOUNT';")
        print("Successfully added DISCOUNT to recommended_action_enum")
    except Exception as e:
        print(f"Error: {e}")
        
    cur.close()
    conn.close()

if __name__ == "__main__":
    fix_enum()
