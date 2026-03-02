from fastapi import APIRouter, HTTPException
from typing import List
from ..mongodb import get_conn
from ..models.schemas import ShelfCreate, ZoneUpdate, ZoneMove

router = APIRouter()

@router.post("/zones/{zone_id}/shelves/bulk")
async def create_shelves_bulk(zone_id: int, shelves: List[ShelfCreate]):
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1. Fetch existing shelves for this zone to identify updates vs inserts
        cur.execute("SELECT id, shelf_code FROM shelves WHERE zone_id = %s", (zone_id,))
        existing_shelves = {row['shelf_code']: row['id'] for row in cur.fetchall()}
        
        processed_ids = set()
        
        # 2. Upsert shelves
        for s in shelves:
            if s.shelf_code in existing_shelves:
                # Update existing shelf
                shelf_id = existing_shelves[s.shelf_code]
                cur.execute(
                    """UPDATE shelves SET 
                       shelf_type = %s, aisle_num = %s, bay_num = %s, level_num = %s, bin_num = %s, 
                       width = %s, depth = %s, height = %s, location_x = %s, location_y = %s, location_z = %s, 
                       max_weight = %s, status = %s
                       WHERE id = %s""",
                    (s.shelf_type, s.aisle_num, s.bay_num, s.level_num, s.bin_num,
                     s.width, s.depth, s.height, s.location_x, s.location_y, s.location_z, 
                     s.max_weight, s.status, shelf_id)
                )
                processed_ids.add(shelf_id)
            else:
                # Insert new shelf
                cur.execute(
                    """INSERT INTO shelves (zone_id, shelf_code, shelf_type, aisle_num, bay_num, level_num, bin_num, 
                       width, depth, height, location_x, location_y, location_z, max_weight, status) 
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (zone_id, s.shelf_code, s.shelf_type, s.aisle_num, s.bay_num, s.level_num, s.bin_num,
                     s.width, s.depth, s.height, s.location_x, s.location_y, s.location_z, 
                     s.max_weight, s.status)
                )

        # 3. Identify shelves to delete (those not in the new list)
        all_existing_ids = set(existing_shelves.values())
        to_delete_ids = list(all_existing_ids - processed_ids)
        
        if to_delete_ids:
            # Check for inventory references before deleting
            placeholders = ','.join(['%s'] * len(to_delete_ids))
            cur.execute(f"SELECT DISTINCT shelf_id FROM inventory WHERE shelf_id IN ({placeholders})", tuple(to_delete_ids))
            referenced_ids = {row['shelf_id'] for row in cur.fetchall()}
            
            # Filter out referenced shelves
            safe_to_delete = [sid for sid in to_delete_ids if sid not in referenced_ids]
            
            if safe_to_delete:
                del_placeholders = ','.join(['%s'] * len(safe_to_delete))
                cur.execute(f"DELETE FROM shelves WHERE id IN ({del_placeholders})", tuple(safe_to_delete))
            
            if referenced_ids:
                print(f"Skipped deleting {len(referenced_ids)} shelves due to existing inventory references.")

        conn.commit()
        return {"message": f"Processed {len(shelves)} shelves (Updated/Inserted). Skipped deletion of {len(referenced_ids) if 'referenced_ids' in locals() else 0} occupied shelves."}
    except Exception as e:
        print(f"Error in create_shelves_bulk: {e}")
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.put("/zones/{zone_id}")
async def update_zone(zone_id: int, z: ZoneUpdate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        update_data = z.dict(exclude_unset=True)
        if not update_data:
            return {"message": "No changes provided"}
        
        fields = ", ".join([f"{k} = %s" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(zone_id)

        cur.execute(f"UPDATE zones SET {fields} WHERE id = %s", values)
        conn.commit()
        return {"message": "Zone updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.delete("/zones/{zone_id}")
async def delete_zone(zone_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1. Delete associated shelves first
        cur.execute("DELETE FROM shelves WHERE zone_id = %s", (zone_id,))
        # 2. Delete the zone
        cur.execute("DELETE FROM zones WHERE id = %s", (zone_id,))
        conn.commit()
        return {"message": "Zone and its shelves deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.post("/zones/{zone_id}/move")
async def move_zone(zone_id: int, m: ZoneMove):
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1. Get old coordinates to calculate delta
        cur.execute("SELECT location_x, location_y FROM zones WHERE id = %s", (zone_id,))
        old = cur.fetchone()
        if not old:
            raise HTTPException(status_code=404, detail="Zone not found")
        
        dx = m.location_x - float(old['location_x'])
        dy = m.location_y - float(old['location_y'])

        # 2. Update Zone
        cur.execute("UPDATE zones SET location_x = %s, location_y = %s WHERE id = %s", (m.location_x, m.location_y, zone_id))

        # 3. Update Shelves by delta
        cur.execute("UPDATE shelves SET location_x = location_x + %s, location_y = location_y + %s WHERE zone_id = %s", (dx, dy, zone_id))

        conn.commit()
        return {"message": "Zone and shelves moved successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
