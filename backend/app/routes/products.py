from fastapi import APIRouter, HTTPException
from app.database import get_conn

router = APIRouter(prefix="/products", tags=["products"])

@router.get("")
def list_products():
    """Used for New Order dropdown."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, sku, name, unit_price, status
            FROM products
            WHERE status IS NULL OR status = 'active'
            ORDER BY id ASC;
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        for r in rows:
            r["unit_price"] = float(r.get("unit_price") or 0)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
