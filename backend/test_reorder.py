import sqlite3

def check_db():
    conn = sqlite3.connect("database.db")
    cursor = conn.cursor()
    
    # 1. Check raw ROP logic (what Reorder Suggestions uses)
    cursor.execute("""
        SELECT p.id, p.name, r.reorder_point, 
               (SELECT COALESCE(SUM(available), 0) FROM inventory i WHERE i.product_id = p.id AND i.status = 'ACTIVE') as total_avail
        FROM products p 
        JOIN reorder_policies r ON p.id = r.product_id
        WHERE total_avail <= r.reorder_point
    """)
    reorder_items = cursor.fetchall()
    
    # 2. Check Health Status table for LOW
    cursor.execute("""
        SELECT product_id FROM inventory_health_status WHERE health_type = 'LOW' AND resolved_at IS NULL
    """)
    health_items = cursor.fetchall()
    
    reorder_ids = {row[0] for row in reorder_items}
    health_ids = {row[0] for row in health_items}
    
    print(f"Items needing reorder: {len(reorder_items)}")
    print(f"Items marked as LOW health: {len(health_items)}")
    
    missing_from_health = reorder_ids - health_ids
    print(f"Missing from low stock health alerts ({len(missing_from_health)} items):")
    for row in reorder_items:
        if row[0] in missing_from_health:
            print(f"- ID: {row[0]}, Name: {row[1]}, ROP: {row[2]}, Avail: {row[3]}")
    
    conn.close()

if __name__ == "__main__":
    check_db()
