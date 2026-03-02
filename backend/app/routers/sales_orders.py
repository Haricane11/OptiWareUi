from fastapi import APIRouter, HTTPException
from app.mongodb import get_conn
from app.models.schemas import SalesOrderCreate, SalesOrderUpdate
from typing import List, Optional
import datetime

router = APIRouter(prefix="/sales-orders", tags=["sales-orders"])

@router.get("")
def list_sales_orders(status: Optional[str] = None):
    """List all sales orders."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        query = """
            SELECT so.id, so.order_number, so.customer_id, c.customer_name, 
                   so.warehouse_id, w.name as warehouse_name,
                   so.status, so.priority_level, so.order_date, so.expected_delivery_date, so.created_at,
                   (SELECT COUNT(*) FROM sales_order_items WHERE sales_order_id = so.id) as item_count,
                   (SELECT COALESCE(SUM(soi.ordered_qty * p.unit_price), 0) 
                    FROM sales_order_items soi 
                    JOIN products p ON soi.product_id = p.id 
                    WHERE soi.sales_order_id = so.id) as total_amount,
                    (SELECT delivery_number FROM delivery_notes WHERE sales_order_id = so.id LIMIT 1) as delivery_note
            FROM sales_orders so
            JOIN customers c ON so.customer_id = c.id
            JOIN warehouses w ON so.warehouse_id = w.id
        """
        params = []
        if status:
            query += " WHERE so.status = %s"
            params.append(status)
        
        # Order by expected_delivery_date (asc) to show urgent orders first, 
        # then by priority_level (custom sort), then by id
        query += """ 
            ORDER BY 
                so.status = 'pending' DESC, -- Pending orders first
                so.expected_delivery_date ASC NULLS LAST, -- Earliest deadline first
                CASE 
                    WHEN so.priority_level = 'urgent' THEN 1 
                    WHEN so.priority_level = 'high' THEN 2 
                    WHEN so.priority_level = 'normal' THEN 3 
                    WHEN so.priority_level = 'low' THEN 4 
                    ELSE 5 
                END,
                so.id DESC;
        """
        
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{order_id}")
def get_sales_order(order_id: int):
    """Get a sales order by ID with items."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Get Order Details
        cur.execute("""
            SELECT so.id, so.order_number, so.customer_id, c.customer_name, 
                   so.warehouse_id, w.name as warehouse_name,
                   so.status, so.priority_level, so.order_date, so.created_at
            FROM sales_orders so
            JOIN customers c ON so.customer_id = c.id
            JOIN warehouses w ON so.warehouse_id = w.id
            WHERE so.id = %s
        """, (order_id,))
        order = cur.fetchone()
        
        if not order:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Sales order not found")
            
        # Get Order Items
        cur.execute("""
            SELECT soi.id, soi.product_id, p.name as product_name, p.sku, 
                   soi.ordered_qty, soi.picked_qty, p.unit_price,
                   (soi.ordered_qty * p.unit_price) as total_price
            FROM sales_order_items soi
            JOIN products p ON soi.product_id = p.id
            WHERE soi.sales_order_id = %s
        """, (order_id,))
        items = cur.fetchall()
        
        order['items'] = items
        
        # Calculate total
        total = sum(item['total_price'] for item in items)
        order['total_amount'] = total
        
        cur.close()
        conn.close()
        return order
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def calculate_priority(expected_date: datetime.date) -> str:
    if not expected_date:
        return "normal"
    
    today = datetime.date.today()
    days_diff = (expected_date - today).days
    
    if days_diff <= 2:
        return "urgent"
    elif days_diff <= 7:
        return "high"
    elif days_diff <= 14:
        return "normal"
    else:
        return "low"

@router.post("")
def create_sales_order(order: SalesOrderCreate):
    """Create a new sales order."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Calculate priority based on expected delivery date
        priority = calculate_priority(order.expected_delivery_date)
        
        # Generate Order Number (SO-YYYYMMDD-XXXX)
        today = datetime.date.today().strftime("%Y%m%d")
        cur.execute("SELECT COUNT(*) FROM sales_orders WHERE order_date = CURRENT_DATE")
        count = cur.fetchone()['count']
        order_number = f"SO-{today}-{count + 1:04d}"
        
        # Insert Order
        cur.execute(
            """
            INSERT INTO sales_orders (
                order_number, customer_id, warehouse_id, status, priority_level, order_date, expected_delivery_date
            ) VALUES (%s, %s, %s, 'pending', %s, COALESCE(%s, CURRENT_DATE), %s)
            RETURNING id;
            """,
            (
                order_number, order.customer_id, order.warehouse_id, 
                priority, order.order_date, order.expected_delivery_date
            )
        )
        order_id = cur.fetchone()['id']
        
        # Insert Items
        for item in order.items:
            cur.execute(
                """
                INSERT INTO sales_order_items (
                    sales_order_id, product_id, ordered_qty, picked_qty
                ) VALUES (%s, %s, %s, 0)
                """,
                (order_id, item.product_id, item.ordered_qty)
            )
            
        conn.commit()
        cur.close()
        conn.close()
        return {"id": order_id, "order_number": order_number, "message": "Sales order created successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{order_id}")
def update_sales_order(order_id: int, order: SalesOrderUpdate):
    """Update a sales order."""
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Check if order exists
        cur.execute("SELECT status FROM sales_orders WHERE id = %s", (order_id,))
        existing_order = cur.fetchone()
        if not existing_order:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Sales order not found")
            
        if existing_order['status'] in ['shipped', 'delivered']:
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail="Cannot update processed orders")

        # Build Update Query for Header
        fields = []
        params = []
        
        if order.customer_id is not None:
            fields.append("customer_id = %s")
            params.append(order.customer_id)
        if order.warehouse_id is not None:
            fields.append("warehouse_id = %s")
            params.append(order.warehouse_id)
        if order.status is not None:
            fields.append("status = %s")
            params.append(order.status)
        if order.order_date is not None:
            fields.append("order_date = %s")
            params.append(order.order_date)

        if order.expected_delivery_date is not None:
            fields.append("expected_delivery_date = %s")
            params.append(order.expected_delivery_date)
            # Recalculate priority if date changes
            new_priority = calculate_priority(order.expected_delivery_date)
            fields.append("priority_level = %s")
            params.append(new_priority)
        elif order.priority_level is not None:
            # Only use provided priority if date wasn't updated
            fields.append("priority_level = %s")
            params.append(order.priority_level)

        if fields:
            query = f"UPDATE sales_orders SET {', '.join(fields)} WHERE id = %s"
            params.append(order_id)
            cur.execute(query, tuple(params))

        # Update Items if provided
        if order.items is not None:
            # Delete existing items
            cur.execute("DELETE FROM sales_order_items WHERE sales_order_id = %s", (order_id,))
            
            # Insert new items
            for item in order.items:
                cur.execute(
                    """
                    INSERT INTO sales_order_items (
                        sales_order_id, product_id, ordered_qty, picked_qty
                    ) VALUES (%s, %s, %s, 0)
                    """,
                    (order_id, item.product_id, item.ordered_qty)
                )

        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Sales order updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{order_id}")
def delete_sales_order(order_id: int):
    """Delete a sales order."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Check if order exists
        cur.execute("SELECT status FROM sales_orders WHERE id = %s", (order_id,))
        order = cur.fetchone()
        if not order:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Sales order not found")
            
        # Check if delivery note exists
        cur.execute("SELECT id, status FROM delivery_notes WHERE sales_order_id = %s", (order_id,))
        delivery_notes = cur.fetchall()
        
        for note in delivery_notes:
            if note['status'] in ['shipped', 'delivered']:
                cur.close()
                conn.close()
                raise HTTPException(status_code=400, detail="Cannot delete order with shipped/delivered delivery note")
            
            # Delete pending delivery note items and note
            cur.execute("DELETE FROM delivery_note_items WHERE delivery_note_id = %s", (note['id'],))
            cur.execute("DELETE FROM delivery_notes WHERE id = %s", (note['id'],))

        # Delete items first (cascade should handle this but let's be safe if no cascade)
        cur.execute("DELETE FROM sales_order_items WHERE sales_order_id = %s", (order_id,))
        
        # Delete order
        cur.execute("DELETE FROM sales_orders WHERE id = %s", (order_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        return {"message": "Sales order deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
