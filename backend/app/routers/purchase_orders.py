from fastapi import APIRouter, HTTPException
from app.mongodb import get_conn
from app.models.purchase_orders import (
    PurchaseOrderListOut,
    PurchaseOrderDetailOut,
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
)

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])

@router.get("", response_model=list[PurchaseOrderListOut])
async def list_purchase_orders():
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

        # Check MongoDB to auto-sync "delivered" status for POs that have invoices
        po_numbers_to_check = [r["po_number"] for r in rows if str(r["status"]).lower() not in ["delivered", "received"]]
        delivered_pos = set()
        
        if po_numbers_to_check:
            from app.mongodb import mongodb
            
            cursor = mongodb.purchase_invoices.find({"po_number": {"$in": po_numbers_to_check}}, {"po_number": 1})
            invoiced_po_numbers = [doc["po_number"] async for doc in cursor]
            delivered_pos = set(invoiced_po_numbers)

            if delivered_pos:
                # Update Postgres for those that now have an invoice
                cur.execute(
                    "UPDATE purchase_orders SET status = 'delivered' WHERE po_number = ANY(%s);",
                    (list(delivered_pos),)
                )
                conn.commit()

        cur.close()
        conn.close()

        for r in rows:
            r["total_amount"] = float(r["total_amount"] or 0)
            if r["po_number"] in delivered_pos:
                r["status"] = "delivered"
                
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{po_id}", response_model=PurchaseOrderDetailOut)
async def get_purchase_order(po_id: int):
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
                w.location AS warehouse_location,
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

        # Check MongoDB to auto-sync "delivered" status
        if str(header.get("status", "")).lower() not in ["delivered", "received"]:
            from app.mongodb import mongodb
            has_invoice = await mongodb.purchase_invoices.find_one({"po_number": header["po_number"]})
                
            if has_invoice:
                cur.execute(
                    "UPDATE purchase_orders SET status = 'delivered' WHERE id = %s;",
                    (po_id,)
                )
                conn.commit()
                header["status"] = "delivered"

        cur.close()
        conn.close()

        items_count = sum(int(i["qty"] or 0) for i in items)
        total_amount = float(sum(float(i["line_total"] or 0) for i in items))

        for i in items:
            i["unit_price"] = float(i["unit_price"] or 0)
            i["line_total"] = float(i["line_total"] or 0)

        header_dict = dict(header)
        header_dict["items"] = items
        header_dict["items_count"] = items_count
        header_dict["total_amount"] = total_amount

        return header_dict
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=PurchaseOrderDetailOut)
async def create_purchase_order(payload: PurchaseOrderCreate):
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
            INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, expected_date)
            VALUES (%s, %s, %s, %s)
            RETURNING id;
            """,
            ("PO-TMP", payload.supplier_id, payload.warehouse_id, payload.expected_date),
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

        # Insert items (validate product exists and is active)
        for it in payload.items:
            cur.execute("SELECT id, status FROM products WHERE id=%s;", (it.product_id,))
            product_data = cur.fetchone()
            if not product_data:
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
        return await get_purchase_order(po_id)
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

@router.delete("/{po_id}")
async def delete_purchase_order(po_id: int):
    """Delete a purchase order and its items."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("BEGIN;")

        # Delete associated items first
        cur.execute("DELETE FROM purchase_order_items WHERE purchase_order_id = %s;", (po_id,))

        # Then delete the purchase order
        cur.execute("DELETE FROM purchase_orders WHERE id = %s RETURNING id;", (po_id,))
        deleted_id = cur.fetchone()

        conn.commit()
        cur.close()
        conn.close()

        if not deleted_id:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        return {"message": "Purchase order deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{po_id}", response_model=PurchaseOrderDetailOut)
async def update_purchase_order(po_id: int, payload: PurchaseOrderUpdate):
    """Update a purchase order and its items."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("BEGIN;")

        # Check if PO exists
        cur.execute("SELECT id FROM purchase_orders WHERE id = %s;", (po_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Purchase order not found")

        # Update PO header
        update_fields = []
        params = []
        if payload.supplier_id is not None:
            update_fields.append("supplier_id = %s")
            params.append(payload.supplier_id)
        if payload.warehouse_id is not None:
            update_fields.append("warehouse_id = %s")
            params.append(payload.warehouse_id)
        if payload.expected_date is not None:
            update_fields.append("expected_date = %s")
            params.append(payload.expected_date)
        if payload.status is not None:
            update_fields.append("status = %s")
            params.append(payload.status)

        if update_fields:
            params.append(po_id)
            cur.execute(
                f"UPDATE purchase_orders SET {', '.join(update_fields)} WHERE id = %s;",
                tuple(params),
            )

        # Update items if provided
        if payload.items is not None:
            # Simple approach: delete all and re-insert or sync. 
            # Given the constraints, let's sync: delete items not in payload, update existing, insert new.
            payload_item_ids = [it.id for it in payload.items if it.id is not None]
            
            # Delete items not in payload
            if payload_item_ids:
                cur.execute(
                    "DELETE FROM purchase_order_items WHERE purchase_order_id = %s AND id NOT IN %s;",
                    (po_id, tuple(payload_item_ids)),
                )
            else:
                cur.execute("DELETE FROM purchase_order_items WHERE purchase_order_id = %s;", (po_id,))

            for it in payload.items:
                if it.id:
                    # Update existing
                    cur.execute(
                        "UPDATE purchase_order_items SET product_id = %s, ordered_qty = %s WHERE id = %s AND purchase_order_id = %s;",
                        (it.product_id, it.ordered_qty, it.id, po_id),
                    )
                else:
                    # Insert new
                    cur.execute(
                        "INSERT INTO purchase_order_items (purchase_order_id, product_id, ordered_qty, received_qty) VALUES (%s, %s, %s, 0);",
                        (po_id, it.product_id, it.ordered_qty),
                    )

        conn.commit()
        cur.close()
        conn.close()

        return await get_purchase_order(po_id)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
