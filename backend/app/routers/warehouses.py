from fastapi import APIRouter, HTTPException
from typing import List
from ..database import get_conn
from ..models.schemas import WarehouseCreate, WarehouseUpdate

router = APIRouter()

@router.get("/warehouses")
async def get_warehouses():
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Complex multi-level JSON aggregation query
        query = """
        SELECT w.*, 
            u.username as owner_name,
            COALESCE((
                SELECT json_agg(floor_data)
                FROM (
                    SELECT f.*,
                    COALESCE((
                        SELECT json_agg(area_data)
                        FROM (SELECT * FROM areas WHERE floor_id = f.id) area_data
                    ), '[]') as areas,
                    COALESCE((
                        SELECT json_agg(zone_data)
                        FROM (
                            SELECT z.*,
                            COALESCE((
                                SELECT json_agg(shelf_data)
                                FROM (SELECT * FROM shelves WHERE zone_id = z.id) shelf_data
                            ), '[]') as shelves
                        FROM zones z
                        WHERE z.floor_id = f.id
                        ) zone_data
                    ), '[]') as zones
                FROM floors f
                WHERE f.warehouse_id = w.id
                ) floor_data
            ), '[]') as floors
        FROM warehouses w
        LEFT JOIN users u ON w.created_by = u.id
        GROUP BY w.id, u.username
        ORDER BY w.created_at DESC;
        """
        cur.execute(query)
        return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.post("/warehouses")
async def create_warehouse_with_floors(w: WarehouseCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # STEP 0: Check if manager already owns a warehouse
        cur.execute("SELECT id FROM warehouses WHERE created_by = %s", (w.created_by,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Manager already owns a warehouse")

        # STEP 1: Insert Warehouse
        cur.execute(
            "INSERT INTO warehouses (name, location, width, height, depth, status, created_by) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (w.name, w.location, w.width, w.height, w.depth, w.status, w.created_by)
        )
        warehouse_id = cur.fetchone()['id']

        # STEP 1.5: Update User's Warehouse Association
        cur.execute("UPDATE users SET warehouse_id = %s WHERE id = %s", (warehouse_id, w.created_by))

        # STEP 2: Iterate through Floors
        for f in w.floors:
            cur.execute(
                "INSERT INTO floors (warehouse_id, floor_number) VALUES (%s, %s) RETURNING id",
                (warehouse_id, f.floor_number)
            )
            floor_id = cur.fetchone()['id']

            # STEP 3: Insert Areas
            if f.areas:
                for a in f.areas:
                    cur.execute(
                        "INSERT INTO areas (floor_id, area_name, width, height, depth, location_x, location_y, area_type, usage_category, is_passable) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (floor_id, a.area_name, a.width, a.height, a.depth, a.location_x, a.location_y, a.area_type, a.usage_category, a.is_passable)
                    )

            # STEP 4: Insert Zones
            if f.zones:
                for z in f.zones:
                    cur.execute(
                        "INSERT INTO zones (floor_id, zone_name, zone_type, width, depth, location_x, location_y) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                        (floor_id, z.zone_name, z.zone_type, z.width, z.depth, z.location_x, z.location_y)
                    )
                    zone_id = cur.fetchone()['id']

                    # STEP 5: Insert Shelves
                    if z.shelves:
                        for s in z.shelves:
                            cur.execute(
                                """INSERT INTO shelves (zone_id, shelf_code, shelf_type, aisle_num, bay_num, level_num, bin_num, 
                                   width, depth, height, location_x, location_y, location_z, max_weight, status) 
                                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                                (zone_id, s.shelf_code, s.shelf_type, s.aisle_num, s.bay_num, s.level_num, s.bin_num,
                                 s.width, s.depth, s.height, s.location_x, s.location_y, s.location_z, 
                                 s.max_weight, s.status)
                            )

        conn.commit()
        return {"message": "Full warehouse hierarchy created successfully", "warehouse_id": warehouse_id}

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.put("/warehouses/{warehouse_id}")
async def update_warehouse(warehouse_id: int, w: WarehouseUpdate, current_user_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Check ownership
        cur.execute("SELECT created_by FROM warehouses WHERE id = %s", (warehouse_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        if row['created_by'] != current_user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this warehouse")

        # Build dynamic update query for provided fields
        update_fields = []
        update_values = []
        
        if w.name is not None:
            update_fields.append("name = %s")
            update_values.append(w.name)
        if w.location is not None:
            update_fields.append("location = %s")
            update_values.append(w.location)
        if w.width is not None:
            update_fields.append("width = %s")
            update_values.append(w.width)
        if w.height is not None:
            update_fields.append("height = %s")
            update_values.append(w.height)
        if w.depth is not None:
            update_fields.append("depth = %s")
            update_values.append(w.depth)
        
        if not update_fields:
            return {"status": "success", "message": "No fields to update"}
        
        update_values.append(warehouse_id)
        query = f"UPDATE warehouses SET {', '.join(update_fields)} WHERE id = %s"
        cur.execute(query, update_values)
        
        # Handle floor count changes
        if w.num_floors is not None:
            # Get current floor count
            cur.execute("SELECT COUNT(*) as count FROM floors WHERE warehouse_id = %s", (warehouse_id,))
            current_count = cur.fetchone()['count']
            
            if w.num_floors > current_count:
                # Add new floors
                for i in range(current_count, w.num_floors):
                    cur.execute(
                        "INSERT INTO floors (warehouse_id, floor_number) VALUES (%s, %s)",
                        (warehouse_id, i)
                    )
            elif w.num_floors < current_count:
                # Remove excess floors (delete from highest floor_number down)
                # First, get the floor IDs that will be deleted
                cur.execute(
                    "SELECT id FROM floors WHERE warehouse_id = %s AND floor_number >= %s",
                    (warehouse_id, w.num_floors)
                )
                floors_to_delete = [row['id'] for row in cur.fetchall()]
                
                if floors_to_delete:
                    # Delete in proper order to respect foreign key constraints
                    for floor_id in floors_to_delete:
                        # 1. Get all zones on this floor
                        cur.execute("SELECT id FROM zones WHERE floor_id = %s", (floor_id,))
                        zone_ids = [row['id'] for row in cur.fetchall()]
                        
                        # 2. Delete all shelves in these zones
                        if zone_ids:
                            cur.execute(
                                f"DELETE FROM shelves WHERE zone_id IN ({','.join(['%s'] * len(zone_ids))})",
                                zone_ids
                            )
                        
                        # 3. Delete all zones on this floor
                        cur.execute("DELETE FROM zones WHERE floor_id = %s", (floor_id,))
                        
                        # 4. Delete all areas on this floor
                        cur.execute("DELETE FROM areas WHERE floor_id = %s", (floor_id,))
                    
                    # 5. Finally, delete the floors themselves
                    cur.execute(
                        "DELETE FROM floors WHERE warehouse_id = %s AND floor_number >= %s",
                        (warehouse_id, w.num_floors)
                    )
        
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
