from fastapi import APIRouter, HTTPException
from app.mongodb import get_conn
from app.models.schemas import DeliveryNoteCreate, ConfirmPickRequest
from typing import List, Optional
import datetime

router = APIRouter(prefix="/delivery-notes", tags=["delivery-notes"])

@router.get("/picking-tasks")
def get_picking_tasks(warehouse_id: Optional[int] = None, zone_id: Optional[int] = None):
    """
    Returns picking tasks for staff, grouped into 'trips' similar to putaway.
    Tasks come from picking_allocations where status is 'PENDING'.
    """
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # 1. Fetch Outbound Dock for distance calculation
        cur.execute("""
            SELECT area_name, location_x, location_y 
            FROM areas 
            WHERE area_type = 'Outbound Docks'
            LIMIT 1
        """)
        dock = cur.fetchone()
        dock_x = float(dock["location_x"]) if dock else 0.0
        dock_y = float(dock["location_y"]) if dock else 0.0
        dock_name = dock["area_name"] if dock else "Outbound Dock"

        params = []
        where_clauses = ["pa.status = 'PENDING'", "dn.status = 'allocated'"]
        
        if warehouse_id:
            where_clauses.append("so.warehouse_id = %s")
            params.append(warehouse_id)
        if zone_id:
            where_clauses.append("s.zone_id = %s")
            params.append(zone_id)
            
        where_stmt = " AND ".join(where_clauses)
        
        query = f"""
            SELECT 
                pa.id,
                p.name as product_name,
                p.sku,
                pa.quantity_allocated as quantity,
                p.handling_type,
                pa.picking_sequence,
                s.shelf_code,
                s.location_x as shelf_x,
                s.location_y as shelf_y,
                s.level_num,
                dn.delivery_number,
                so.order_number,
                i.total_weight,
                i.quantity as inventory_qty
            FROM picking_allocations pa
            JOIN delivery_note_items dni ON pa.delivery_note_item_id = dni.id
            JOIN delivery_notes dn ON dni.delivery_note_id = dn.id
            JOIN sales_order_items soi ON dni.sales_order_item_id = soi.id
            JOIN sales_orders so ON dn.sales_order_id = so.id
            JOIN products p ON soi.product_id = p.id
            JOIN inventory i ON pa.inventory_id = i.id
            JOIN shelves s ON i.shelf_id = s.id
            WHERE {where_stmt} AND COALESCE(LOWER(s.status), 'active') = 'active'
            ORDER BY pa.picking_sequence ASC
        """
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        
        # Process tasks for distances and equipment logic
        raw_tasks = []
        for r in rows:
            s_x = float(r["shelf_x"] or 0)
            s_y = float(r["shelf_y"] or 0)
            distance = round(abs(dock_x - s_x) + abs(dock_y - s_y))
            
            # Estimate weight for this pick: (allocated qty / bin qty) * bin weight
            est_weight = 0.0
            if r["inventory_qty"] > 0:
                est_weight = (float(r["quantity"]) / float(r["inventory_qty"])) * float(r["total_weight"] or 0)

            raw_tasks.append({
                "id": r["id"],
                "product": r["product_name"],
                "sku": r["sku"],
                "quantity": r["quantity"],
                "order_number": r["order_number"],
                "delivery_number": r["delivery_number"],
                "weight": round(est_weight, 2),
                "from": r["shelf_code"],
                "to": dock_name,
                "level": int(r["level_num"] or 1),
                "distance_val": distance,
                "distance": f"{distance}m",
                "priority": "high"
            })

        if not raw_tasks:
            return []

        # Simple grouping into one path for now (can expand equipment logic later)
        # In a real warehouse, we'd use the same equipment specs as putaway.
        return [{
            "equipment": "Hand Truck" if all(t["level"] <= 1 for t in raw_tasks) else "Reach Truck",
            "total_weight": "0.0kg",
            "tasks": raw_tasks
        }]

    except Exception as e:
        print(f"ERROR in get_picking_tasks: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

@router.get("")
def list_delivery_notes():
    """List all delivery notes."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        query = """
            SELECT dn.id, dn.delivery_number, dn.sales_order_id, dn.status, dn.shipped_at, dn.created_at,
                   so.order_number, c.customer_name, so.expected_delivery_date, so.priority_level,
                   (SELECT COUNT(*) FROM delivery_note_items WHERE delivery_note_id = dn.id) as item_count
            FROM delivery_notes dn
            JOIN sales_orders so ON dn.sales_order_id = so.id
            JOIN customers c ON so.customer_id = c.id
            ORDER BY 
                dn.status = 'pending' DESC, -- Pending notes first
                so.expected_delivery_date ASC NULLS LAST, -- Earliest deadline first
                CASE 
                    WHEN so.priority_level = 'urgent' THEN 1 
                    WHEN so.priority_level = 'high' THEN 2 
                    WHEN so.priority_level = 'normal' THEN 3 
                    WHEN so.priority_level = 'low' THEN 4 
                    ELSE 5 
                END,
                dn.id DESC;
        """
        cur.execute(query)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{note_id}")
def get_delivery_note(note_id: int):
    """Get a delivery note by ID."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Get Delivery Note Header
        query = """
            SELECT dn.id, dn.delivery_number, dn.sales_order_id, dn.status, dn.shipped_at, dn.created_at,
                   so.order_number, c.customer_name, w.name as warehouse_name
            FROM delivery_notes dn
            JOIN sales_orders so ON dn.sales_order_id = so.id
            JOIN customers c ON so.customer_id = c.id
            JOIN warehouses w ON so.warehouse_id = w.id
            WHERE dn.id = %s
        """
        cur.execute(query, (note_id,))
        note = cur.fetchone()
        
        if not note:
            raise HTTPException(status_code=404, detail="Delivery note not found")
            
        # Get Delivery Note Items
        item_query = """
            SELECT dni.id, dni.shipped_qty, p.name as product_name, p.sku, soi.ordered_qty
            FROM delivery_note_items dni
            JOIN sales_order_items soi ON dni.sales_order_item_id = soi.id
            JOIN products p ON soi.product_id = p.id
            WHERE dni.delivery_note_id = %s
        """
        cur.execute(item_query, (note_id,))
        items = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return {**note, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
def create_delivery_note(note: DeliveryNoteCreate):
    """Create a delivery note from a sales order."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Check if sales order exists
        cur.execute("SELECT * FROM sales_orders WHERE id = %s", (note.sales_order_id,))
        so = cur.fetchone()
        if not so:
            raise HTTPException(status_code=404, detail="Sales order not found")
            
        # Check if delivery note already exists for this order
        cur.execute("SELECT id FROM delivery_notes WHERE sales_order_id = %s", (note.sales_order_id,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Delivery note already exists for this order")

        # Generate Delivery Number (DN-YYYYMMDD-XXXX)
        today = datetime.date.today().strftime("%Y%m%d")
        cur.execute("SELECT COUNT(*) FROM delivery_notes WHERE DATE(created_at) = CURRENT_DATE")
        count = cur.fetchone()['count']
        delivery_number = f"DN-{today}-{count + 1:04d}"
        
        # Insert Delivery Note
        cur.execute(
            """
            INSERT INTO delivery_notes (
                delivery_number, sales_order_id, status, shipped_at
            ) VALUES (%s, %s, 'pending', NULL)
            RETURNING id;
            """,
            (delivery_number, note.sales_order_id)
        )
        dn_id = cur.fetchone()['id']
        
        # Get Sales Order Items
        cur.execute("SELECT id, product_id, ordered_qty FROM sales_order_items WHERE sales_order_id = %s", (note.sales_order_id,))
        items = cur.fetchall()
        
        # Insert Delivery Note Items (Assume full shipment for now)
        for item in items:
            cur.execute(
                """
                INSERT INTO delivery_note_items (
                    delivery_note_id, sales_order_item_id, shipped_qty
                ) VALUES (%s, %s, %s)
                """,
                (dn_id, item['id'], item['ordered_qty'])
            )
            
        # Update Sales Order Status to 'processing' (or similar, indicating a DN is created but not shipped)
        cur.execute("UPDATE sales_orders SET status = 'processing' WHERE id = %s", (note.sales_order_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        return {"id": dn_id, "delivery_number": delivery_number, "message": "Delivery note created successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{note_id}/confirm")
def confirm_delivery_note(note_id: int):
    """Confirm a delivery note and allocate inventory using picking rules."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT area_name, location_x, location_y 
            FROM areas 
            WHERE area_type = 'Outbound Docks'
            LIMIT 1
        """)
        dock = cur.fetchone()
        dock_x = float(dock["location_x"]) if dock else 0.0
        dock_y = float(dock["location_y"]) if dock else 0.0
        
        # 1. Get DN items and details
        cur.execute("""
            SELECT dni.id, dni.shipped_qty, soi.product_id, dn.status, dn.delivery_number
            FROM delivery_note_items dni
            JOIN delivery_notes dn ON dni.delivery_note_id = dn.id
            JOIN sales_order_items soi ON dni.sales_order_item_id = soi.id
            WHERE dn.id = %s
        """, (note_id,))
        dn_items = cur.fetchall()
        
        if not dn_items:
            raise HTTPException(status_code=404, detail="Delivery note not found or has no items")
        
        if dn_items[0]['status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Delivery note is already {dn_items[0]['status']}")

        # 2. Process each item (Product)
        shortages = []
        allocations_made = 0
        for item in dn_items:
            required_qty = item['shipped_qty']
            product_id = item['product_id']
            dni_id = item['id']
            
            # Phase 1: Query & Prioritization Hierarchy
            # Fact 1: is_seal ASC (False first)
            # Fact 2: quantity ASC (Smallest pile first)
            # Fact 3: Location ASC (Aisle, Bay, Level)
            cur.execute("""
                SELECT 
                    i.id, 
                    i.quantity, 
                    COALESCE(i.allocated, 0) AS allocated, 
                    (i.quantity - COALESCE(i.allocated, 0)) AS available_calc, 
                    i.is_sealed, 
                    i.shelf_id, 
                    i.total_volume,
                    s.aisle_num, 
                    s.bay_num, 
                    s.level_num, 
                    s.location_x, 
                    s.location_y
                FROM inventory i
                JOIN shelves s ON i.shelf_id = s.id
                WHERE i.product_id = %s 
                  AND (i.quantity - COALESCE(i.allocated, 0)) > 0
                  AND COALESCE(LOWER(i.status), 'available') IN ('available', 'sealed')
                  AND COALESCE(LOWER(s.status), 'active') = 'active'
            """, (product_id,))
            available_stock = cur.fetchall()
            
            available_stock.sort(
                key=lambda r: (
                    r["is_sealed"],
                    float(r["available_calc"]),
                    r["aisle_num"],
                    r["bay_num"],
                    r["level_num"],
                    round(abs(dock_x - float(r["location_x"] or 0)) + abs(dock_y - float(r["location_y"] or 0))),
                )
            )
            
            allocated_so_far = 0
            picking_sequence = 1
            
            # Phase 2: Fulfillment Loop
            for stock in available_stock:
                if required_qty <= 0:
                    break
                    
                take_qty = min(float(stock['available_calc']), float(required_qty))
                
                # UPDATE: State-based allocation (Refinement)
                # We stop reducing 'quantity' directly.
                # Increase 'allocated'. 'available' is a GENERATED column (quantity - allocated).
                # Increasing 'allocated' will automatically decrease 'available'.
                # Shelf volume and inventory total_volume remain unchanged until physical pick.
                
                new_allocated = float(stock['allocated'] or 0) + float(take_qty)
                
                # Fact 6: If partial taken or seal broken, set is_sealed = false
                new_is_sealed = stock['is_sealed']
                if take_qty > 0:
                    new_is_sealed = False
                
                cur.execute("""
                    UPDATE inventory 
                    SET allocated = %s, is_sealed = %s
                    WHERE id = %s
                """, (new_allocated, new_is_sealed, stock['id']))
                
                # Record in picking_allocations
                cur.execute("""
                    INSERT INTO picking_allocations (
                        delivery_note_item_id, inventory_id, quantity_allocated, picking_sequence, status
                    ) VALUES (%s, %s, %s, %s, 'PENDING')
                """, (dni_id, stock['id'], take_qty, picking_sequence))
                
                required_qty -= take_qty
                allocated_so_far += take_qty
                picking_sequence += 1
                allocations_made += 1
                
            # Fact 8: Shortage Handling (allow partial allocation)
            if required_qty > 0:
                shortages.append({
                    "product_id": product_id,
                    "shortage_qty": required_qty
                })

        # 3. Update DN status
        if allocations_made > 0:
            cur.execute("UPDATE delivery_notes SET status = 'allocated' WHERE id = %s", (note_id,))
        else:
            # If nothing could be allocated at all, keep pending and return 400
            conn.rollback()
            raise HTTPException(status_code=400, detail="No inventory available to allocate for this delivery note")
        
        conn.commit()
        cur.close()
        conn.close()
        return {
            "message": "Delivery note confirmed and inventory allocated successfully",
            "status": "allocated",
            "shortages": shortages
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/confirm-pick")
def confirm_pick(req: ConfirmPickRequest):
    """Marks a picking allocation as COMPLETED and performs physical inventory reduction."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # 1. Get allocation details and current inventory state
        cur.execute("""
            SELECT pa.quantity_allocated, pa.inventory_id, i.shelf_id, i.quantity, i.total_volume, i.total_weight
            FROM picking_allocations pa
            JOIN inventory i ON pa.inventory_id = i.id
            WHERE pa.id = %s
        """, (req.allocation_id,))
        alloc = cur.fetchone()
        
        if not alloc:
            raise HTTPException(status_code=404, detail="Allocation not found")
            
        picked_qty = float(alloc['quantity_allocated'])
        inv_id = alloc['inventory_id']
        shelf_id = alloc['shelf_id']
        current_inv_qty = float(alloc['quantity'])
        
        # 2. Calculate volume and weight reduction
        # We use a proportion of the current volume/weight
        vol_to_reduce = 0.0
        weight_to_reduce = 0.0
        if current_inv_qty > 0:
            vol_per_unit = float(alloc['total_volume'] or 0) / current_inv_qty
            weight_per_unit = float(alloc['total_weight'] or 0) / current_inv_qty
            vol_to_reduce = vol_per_unit * picked_qty
            weight_to_reduce = weight_per_unit * picked_qty
            
        # 3. Update Inventory (Physical Reduction)
        cur.execute("""
            UPDATE inventory 
            SET quantity = quantity - %s,
                allocated = allocated - %s,
                total_volume = GREATEST(0, total_volume - %s),
                total_weight = GREATEST(0, total_weight - %s)
            WHERE id = %s
        """, (picked_qty, picked_qty, vol_to_reduce, weight_to_reduce, inv_id))
        
        # 4. Update Shelf (Physical Volume Reduction)
        cur.execute("""
            UPDATE shelves 
            SET used_volume = GREATEST(0, used_volume - %s)
            WHERE id = %s
        """, (vol_to_reduce, shelf_id))
        
        # 5. Mark Allocation as COMPLETED
        cur.execute("UPDATE picking_allocations SET status = 'COMPLETED' WHERE id = %s", (req.allocation_id,))
        
        # 6. Check if all allocations for this Delivery Note are COMPLETED (Refinement)
        cur.execute("""
            SELECT pa.status
            FROM picking_allocations pa
            JOIN delivery_note_items dni ON pa.delivery_note_item_id = dni.id
            WHERE dni.delivery_note_id = (
                SELECT dni2.delivery_note_id 
                FROM delivery_note_items dni2 
                WHERE dni2.id = (SELECT delivery_note_item_id FROM picking_allocations WHERE id = %s)
            )
        """, (req.allocation_id,))
        all_allocs = cur.fetchall()
        
        if all(a['status'] == 'COMPLETED' for a in all_allocs):
            # Get the DN ID to update
            cur.execute("""
                SELECT dni.delivery_note_id 
                FROM delivery_note_items dni 
                JOIN picking_allocations pa ON dni.id = pa.delivery_note_item_id
                WHERE pa.id = %s
            """, (req.allocation_id,))
            dn_id = cur.fetchone()['delivery_note_id']
            
            cur.execute("UPDATE delivery_notes SET status = 'picked' WHERE id = %s", (dn_id,))
            print(f"Delivery Note {dn_id} status updated to 'picked' (all items confirmed)")
        
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "message": "Pick confirmed and inventory reduced"}
    except Exception as e:
        if 'conn' in locals(): conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{note_id}/status")
def update_delivery_note_status(note_id: int, status_update: dict):
    """Update delivery note status (e.g. to 'shipped')."""
    try:
        status = status_update.get("status")
        if status not in ['pending', 'picked', 'shipped', 'delivered']:
             raise HTTPException(status_code=400, detail="Invalid status")
             
        conn = get_conn()
        cur = conn.cursor()
        
        cur.execute("UPDATE delivery_notes SET status = %s WHERE id = %s", (status, note_id))
        if status == 'picked':
            cur.execute("""
                SELECT pa.id, pa.quantity_allocated, pa.inventory_id
                FROM picking_allocations pa
                JOIN delivery_note_items dni ON pa.delivery_note_item_id = dni.id
                WHERE dni.delivery_note_id = %s AND pa.status <> 'COMPLETED'
            """, (note_id,))
            allocs = cur.fetchall()
            for a in allocs:
                cur.execute("""
                    SELECT id, shelf_id, quantity, total_volume, total_weight
                    FROM inventory
                    WHERE id = %s
                """, (a['inventory_id'],))
                inv = cur.fetchone()
                if inv:
                    picked_qty = float(a['quantity_allocated'])
                    current_inv_qty = float(inv['quantity'])
                    vol_to_reduce = 0.0
                    weight_to_reduce = 0.0
                    if current_inv_qty > 0:
                        vol_per_unit = float(inv['total_volume'] or 0) / current_inv_qty
                        weight_per_unit = float(inv['total_weight'] or 0) / current_inv_qty
                        vol_to_reduce = vol_per_unit * picked_qty
                        weight_to_reduce = weight_per_unit * picked_qty
                    cur.execute("""
                        UPDATE inventory 
                        SET quantity = quantity - %s,
                            allocated = allocated - %s,
                            total_volume = GREATEST(0, total_volume - %s),
                            total_weight = GREATEST(0, total_weight - %s)
                        WHERE id = %s
                    """, (picked_qty, picked_qty, vol_to_reduce, weight_to_reduce, inv['id']))
                    cur.execute("""
                        UPDATE shelves 
                        SET used_volume = GREATEST(0, used_volume - %s)
                        WHERE id = %s
                    """, (vol_to_reduce, inv['shelf_id']))
                    cur.execute("UPDATE picking_allocations SET status = 'COMPLETED' WHERE id = %s", (a['id'],))
        elif status == 'shipped':
            cur.execute("UPDATE delivery_notes SET shipped_at = CURRENT_TIMESTAMP WHERE id = %s", (note_id,))
            
        conn.commit()
        cur.close()
        conn.close()
        return {"message": f"Status updated to {status}"}
    except Exception as e:
        if 'conn' in locals(): conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{note_id}")
def delete_delivery_note(note_id: int):
    """Delete a delivery note and revert its impact on inventory and sales orders."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # 1. Get current status and sales order link
        cur.execute("SELECT sales_order_id, status FROM delivery_notes WHERE id = %s", (note_id,))
        res = cur.fetchone()
        if not res:
             raise HTTPException(status_code=404, detail="Delivery note not found")
        
        status = res['status']
        sales_order_id = res['sales_order_id']

        # 2. Prevent deletion of shipped/delivered notes
        if status not in ['pending', 'allocated', 'picked']:
             raise HTTPException(status_code=400, detail=f"Cannot delete a delivery note with status '{status}'")

        # 3. If 'allocated' or 'picked', revert inventory allocations (Refinement)
        if status in ['allocated', 'picked']:
            # Get all allocations for this DN
            cur.execute("""
                SELECT pa.inventory_id, pa.quantity_allocated
                FROM picking_allocations pa
                JOIN delivery_note_items dni ON pa.delivery_note_item_id = dni.id
                WHERE dni.delivery_note_id = %s
            """, (note_id,))
            allocations = cur.fetchall()
            
            for alloc in allocations:
                if status == 'allocated':
                    # Revert reservation only: allocated down
                    # 'available' is generated (qty - allocated), so it will increase automatically.
                    cur.execute("""
                        UPDATE inventory 
                        SET allocated = allocated - %s
                        WHERE id = %s
                    """, (alloc['quantity_allocated'], alloc['inventory_id']))
                else: # status == 'picked'
                    # Revert physical reduction: qty up, available up (via allocated change)
                    # We also need to be careful with volume, but for deletion we'll focus on quantities first.
                    cur.execute("""
                        UPDATE inventory 
                        SET quantity = quantity + %s,
                            allocated = allocated - %s
                        WHERE id = %s
                    """, (alloc['quantity_allocated'], alloc['quantity_allocated'], alloc['inventory_id']))
                
            # Delete picking_allocations
            cur.execute("""
                DELETE FROM picking_allocations
                WHERE id IN (
                    SELECT pa.id FROM picking_allocations pa
                    JOIN delivery_note_items dni ON pa.delivery_note_item_id = dni.id
                    WHERE dni.delivery_note_id = %s
                )
            """, (note_id,))

        # 4. Delete Delivery Note Items
        cur.execute("DELETE FROM delivery_note_items WHERE delivery_note_id = %s", (note_id,))
        
        # 5. Delete Delivery Note Header
        cur.execute("DELETE FROM delivery_notes WHERE id = %s", (note_id,))
        
        # 6. Revert Sales Order Status
        cur.execute("UPDATE sales_orders SET status = 'ready' WHERE id = %s", (sales_order_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "message": "Delivery note deleted and inventory reverted successfully"}
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
