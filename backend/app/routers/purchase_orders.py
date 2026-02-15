from fastapi import APIRouter, HTTPException
from app.database import get_conn
from app.models.purchase_orders import (
    PurchaseOrderListOut,
    PurchaseOrderDetailOut,
    PurchaseOrderCreate,
)

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])

@router.get("", response_model=list[PurchaseOrderListOut])
def list_purchase_orders():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                po.id,
                po.po_number,
                po.supplier_id,
                s.name AS supplier_name,
                po.status,
                po.expected_date,
                po.created_at,
                COALESCE(SUM(poi.ordered_qty), 0) AS items_count,
                COALESCE(SUM(poi.ordered_qty * COALESCE(p.unit_price, 0)), 0) AS total_amount
            FROM purchase_orders po
            JOIN suppliers s ON s.id = po.supplier_id
            LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
            LEFT JOIN products p ON p.id = poi.product_id
            GROUP BY po.id, s.name
            ORDER BY po.created_at DESC, po.id DESC;
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        for r in rows:
            r["total_amount"] = float(r["total_amount"] or 0)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{po_id}", response_model=PurchaseOrderDetailOut)
def get_purchase_order(po_id: int):
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT
                po.id,
                po.po_number,
                po.supplier_id,
                s.name AS supplier_name,
                s.address AS supplier_address,
                s.contact_person AS supplier_contact_person,
                s.email AS supplier_email,
                s.phone AS supplier_phone,
                po.warehouse_id,
                w.name AS warehouse_name,
                po.status,
                po.expected_date,
                po.created_at
            FROM purchase_orders po
            JOIN suppliers s ON s.id = po.supplier_id
            LEFT JOIN warehouses w ON w.id = po.warehouse_id
            WHERE po.id = %s
            LIMIT 1;
            """,
            (po_id,),
        )
        header = cur.fetchone()
        if not header:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Purchase order not found")

        cur.execute(
            """
            SELECT
                poi.id,
                poi.product_id,
                p.sku AS sku,
                p.name AS product_name,
                poi.ordered_qty AS qty,
                COALESCE(p.unit_price, 0) AS unit_price,
                (poi.ordered_qty * COALESCE(p.unit_price, 0)) AS line_total
            FROM purchase_order_items poi
            JOIN products p ON p.id = poi.product_id
            WHERE poi.purchase_order_id = %s
            ORDER BY poi.id ASC;
            """,
            (po_id,),
        )
        items = cur.fetchall()

        cur.close()
        conn.close()

        items_count = sum(int(i["qty"] or 0) for i in items)
        total_amount = float(sum(float(i["line_total"] or 0) for i in items))

        for i in items:
            i["unit_price"] = float(i["unit_price"] or 0)
            i["line_total"] = float(i["line_total"] or 0)

        return {**header, "items": items, "items_count": items_count, "total_amount": total_amount}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=PurchaseOrderDetailOut)
def create_purchase_order(payload: PurchaseOrderCreate):
    """Create a new PO + items in a single transaction.

    - Inserts into purchase_orders (po_number temporary, then update using generated id)
    - Inserts items into purchase_order_items
    - Returns the full PO detail (same shape as GET /purchase-orders/{id})
    """
    if not payload.items or len(payload.items) == 0:
        raise HTTPException(status_code=400, detail="At least 1 line item is required.")

    try:
        conn = get_conn()
        cur = conn.cursor()
        # transaction
        cur.execute("BEGIN;")

        # basic FK validation (optional but friendly errors)
        cur.execute("SELECT id FROM suppliers WHERE id=%s;", (payload.supplier_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Invalid supplier_id")

        cur.execute("SELECT id, name FROM warehouses WHERE id=%s;", (payload.warehouse_id,))
        wh = cur.fetchone()
        if not wh:
            raise HTTPException(status_code=400, detail="Invalid warehouse_id")

        # Insert PO with temp po_number, then update
        cur.execute(
            """
            INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, expected_date)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id;
            """,
            ("PO-TMP", payload.supplier_id, payload.warehouse_id, payload.status, payload.expected_date),
        )
        po_id = cur.fetchone()["id"]

        # update po_number like PO-2401 style (4 digits). If you prefer 2401 style, change formatting here.
        cur.execute(
            """
            UPDATE purchase_orders
            SET po_number = 'PO-' || LPAD(%s::text, 4, '0')
            WHERE id = %s;
            """,
            (po_id, po_id),
        )

        # Insert items (validate product exists)
        for it in payload.items:
            cur.execute("SELECT id FROM products WHERE id=%s;", (it.product_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=400, detail=f"Invalid product_id: {it.product_id}")

            cur.execute(
                """
                INSERT INTO purchase_order_items (purchase_order_id, product_id, ordered_qty, received_qty)
                VALUES (%s, %s, %s, 0);
                """,
                (po_id, it.product_id, it.ordered_qty),
            )

        cur.execute("COMMIT;")
        cur.close()
        conn.close()

        # reuse GET logic to return detail
        return get_purchase_order(po_id)
    except HTTPException:
        try:
            cur.execute("ROLLBACK;")
        except Exception:
            pass
        try:
            cur.close()
            conn.close()
        except Exception:
            pass
        raise
    except Exception as e:
        try:
            cur.execute("ROLLBACK;")
        except Exception:
            pass
        try:
            cur.close()
            conn.close()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))
