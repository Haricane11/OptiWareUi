from fastapi import APIRouter, HTTPException
from ..database import get_conn
from ..models.schemas import ShelfUpdate

router = APIRouter()

@router.put("/shelves/{shelf_id}")
async def update_shelf(shelf_id: int, s: ShelfUpdate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        update_data = s.dict(exclude_unset=True)
        if not update_data:
            return {"message": "No changes provided"}
        
        fields = ", ".join([f"{k} = %s" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(shelf_id)

        cur.execute(f"UPDATE shelves SET {fields} WHERE id = %s", values)
        conn.commit()
        return {"message": "Shelf updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.delete("/shelves/{shelf_id}")
async def delete_shelf(shelf_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM shelves WHERE id = %s", (shelf_id,))
        conn.commit()
        return {"message": "Shelf deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
