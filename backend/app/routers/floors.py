from fastapi import APIRouter, HTTPException
from ..database import get_conn
from ..models.schemas import ZoneCreate

router = APIRouter()

@router.post("/floors/{floor_id}/zones")
async def create_zone(floor_id: int, z: ZoneCreate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO zones (floor_id, zone_name, zone_type, width, depth, location_x, location_y) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (floor_id, z.zone_name, z.zone_type, z.width, z.depth, z.location_x, z.location_y)
        )
        zone_id = cur.fetchone()['id']

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
        return {"message": "Zone created successfully", "id": zone_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
