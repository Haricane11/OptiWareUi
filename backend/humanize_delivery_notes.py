from app.mongodb import get_conn
import random
from datetime import datetime, timedelta

def humanize_data():
    conn = get_conn()
    cur = conn.cursor()
    
    # 1. Humanize Customers
    real_names = ["Aung Aung", "Kyaw Kyaw", "Su Su", "Hla Hla", "Mya Mya", "Zin Ko Ko", "Thiri May", "Min Htet"]
    cur.execute("SELECT id FROM customers WHERE customer_name = 'name'")
    mock_customers = cur.fetchall()
    
    print(f"Humanizing {len(mock_customers)} customers...")
    for cust in mock_customers:
        new_name = random.choice(real_names)
        cur.execute("UPDATE customers SET customer_name = %s WHERE id = %s", (new_name, cust['id']))
        
    # 2. Humanize Sales Order Numbers and Dates
    cur.execute("SELECT id, order_number FROM sales_orders WHERE order_number LIKE '%MOCK%'")
    mock_sos = cur.fetchall()
    
    print(f"Humanizing {len(mock_sos)} sales orders...")
    for so in mock_sos:
        # DN-MOCK-4745-0-388 -> SO-2024-0388
        new_number = so['order_number'].replace("SO-MOCK-", "SO-")
        # Ensure we have a date
        cur.execute("""
            UPDATE sales_orders 
            SET order_number = %s,
                expected_delivery_date = COALESCE(expected_delivery_date, CURRENT_DATE + interval '3 days')
            WHERE id = %s
        """, (new_number, so['id']))

    # 3. Humanize Delivery Note Numbers
    cur.execute("SELECT id, delivery_number FROM delivery_notes WHERE delivery_number LIKE '%MOCK%'")
    mock_dns = cur.fetchall()
    
    print(f"Humanizing {len(mock_dns)} delivery notes...")
    for dn in mock_dns:
        new_number = dn['delivery_number'].replace("DN-MOCK-", "DN-")
        cur.execute("UPDATE delivery_notes SET delivery_number = %s WHERE id = %s", (new_number, dn['id']))
        
    conn.commit()
    cur.close()
    conn.close()
    print("Humanization complete!")

if __name__ == "__main__":
    humanize_data()
