from fastapi import APIRouter, HTTPException
from app.database import get_conn

router = APIRouter(prefix="/warehouses", tags=["warehouses"])

@router.get("")
def list_warehouses():
    """Used for New Order dropdown."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, name
            FROM warehouses
            ORDER BY id ASC;
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
