from fastapi import APIRouter, HTTPException
from ..database import get_conn
from ..models.schemas import AreaCreate, AreaUpdate

router = APIRouter()

@router.post("/floors/{floor_id}/areas")
async def create_area(floor_id: int, a: AreaCreate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO areas (floor_id, area_name, width, height, depth, location_x, location_y, area_type, usage_category, is_passable) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (floor_id, a.area_name, a.width, a.height, a.depth, a.location_x, a.location_y, a.area_type, a.usage_category, a.is_passable)
        )
        area_id = cur.fetchone()['id']
        conn.commit()
        return {"message": "Area created successfully", "id": area_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.put("/areas/{area_id}")
async def update_area(area_id: int, a: AreaUpdate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        update_data = a.dict(exclude_unset=True)
        if not update_data:
            return {"message": "No changes provided"}
        
        fields = ", ".join([f"{k} = %s" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(area_id)

        cur.execute(f"UPDATE areas SET {fields} WHERE id = %s", values)
        conn.commit()
        return {"message": "Area updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.delete("/areas/{area_id}")
async def delete_area(area_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM areas WHERE id = %s", (area_id,))
        conn.commit()
        return {"message": "Area deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
