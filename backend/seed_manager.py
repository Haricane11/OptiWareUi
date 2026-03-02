import psycopg2

conn = psycopg2.connect(host="127.0.0.1", port=5433, dbname="wms", user="wms_user", password="root123")
cur = conn.cursor()

# Check if username column has a unique constraint
cur.execute("SELECT id, username, password, role FROM users WHERE role = 'manager'")
existing = cur.fetchone()
if existing:
    print(f"Manager already exists: id={existing[0]}, username={existing[1]}, password={existing[2]}, role={existing[3]}")
else:
    cur.execute(
        "INSERT INTO users (username, password, role, status) VALUES (%s, %s, %s, %s) RETURNING id, username, role",
        ("manager", "manager123", "manager", "active")
    )
    row = cur.fetchone()
    print(f"Created manager user: id={row[0]}, username={row[1]}, role={row[2]}")
    print("Credentials => username: manager, password: manager123")
    conn.commit()

# Also create a staff user
cur.execute("SELECT id, username, password, role FROM users WHERE role = 'staff'")
existing_staff = cur.fetchone()
if existing_staff:
    print(f"Staff already exists: id={existing_staff[0]}, username={existing_staff[1]}, password={existing_staff[2]}, role={existing_staff[3]}")
else:
    cur.execute(
        "INSERT INTO users (username, password, role, status) VALUES (%s, %s, %s, %s) RETURNING id, username, role",
        ("staff", "staff123", "staff", "active")
    )
    row = cur.fetchone()
    print(f"Created staff user: id={row[0]}, username={row[1]}, role={row[2]}")
    print("Credentials => username: staff, password: staff123")
    conn.commit()

# Show all users
cur.execute("SELECT id, username, password, role FROM users")
print("\n--- All Users ---")
for row in cur.fetchall():
    print(f"  id={row[0]}, username={row[1]}, password={row[2]}, role={row[3]}")

cur.close()
conn.close()
