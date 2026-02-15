from fastapi import APIRouter, HTTPException
from app.database import get_conn
from app.models.suppliers import SupplierOut, SupplierCreate, SupplierUpdate

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=list[SupplierOut])
def list_suppliers():
    """List suppliers + computed columns for the table (products_count, last_order)."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
SELECT
    s.*,
    COALESCE(pp.product_count, 0) AS products_count,
    po.last_order
FROM suppliers s
LEFT JOIN (
    -- Count distinct products that ever appeared in purchase order items for each supplier
    SELECT
        po.supplier_id,
        COUNT(DISTINCT li.product_id) AS product_count
    FROM purchase_orders po
    JOIN purchase_order_items li
        ON li.purchase_order_id = po.id
    GROUP BY po.supplier_id
) pp ON pp.supplier_id = s.id
LEFT JOIN (
    SELECT supplier_id, MAX(created_at) AS last_order
    FROM purchase_orders
    GROUP BY supplier_id
) po ON po.supplier_id = s.id
ORDER BY s.id;
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=SupplierOut)
def create_supplier(payload: SupplierCreate):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO suppliers
                (name, phone, email, contact_person, address, status)
            VALUES
                (%s, %s, %s, %s, %s, %s)
            RETURNING
                id, name, phone, email, contact_person, address, status, created_at;
            """,
            (
                payload.name,
                payload.phone,
                payload.email,
                payload.contact_person,
                payload.address,
                payload.status or "active",
            ),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return row
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, payload: SupplierUpdate):
    """Edit Profile: update supplier fields."""
    try:
        data = payload.model_dump(exclude_unset=True)
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update.")

        allowed = {"name", "phone", "email", "contact_person", "address", "status"}
        data = {k: v for k, v in data.items() if k in allowed}

        if not data:
            raise HTTPException(status_code=400, detail="No valid fields to update.")

        set_clause = ", ".join([f"{k} = %s" for k in data.keys()])
        values = list(data.values()) + [supplier_id]

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE suppliers
            SET {set_clause}
            WHERE id = %s
            RETURNING id, name, phone, email, contact_person, address, status, created_at;
            """,
            values,
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Supplier not found.")

        conn.commit()
        cur.close()
        conn.close()
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
