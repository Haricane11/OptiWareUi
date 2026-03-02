"""
Receiving Router
=================
POST /receiving/place-product  – run placement engine → write receipt_items + inventory
GET  /receiving/inventory-shelf-view – return all inventory rows with product+shelf details
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from decimal import Decimal
from app.mongodb import get_conn, mongodb
from app.services.placement_engine import find_optimal_shelf, match_shelf_in_memory

router = APIRouter(prefix="/receiving", tags=["Receiving"])

def _fix_decimals(data):
    """Recursively convert Decimals to floats in dicts/lists."""
    if isinstance(data, dict):
        return {k: _fix_decimals(v) for k, v in data.items()}
    if isinstance(data, list):
        return [_fix_decimals(v) for v in data]
    if isinstance(data, Decimal):
        return float(data)
    return data


# ── Request / Response models ──────────────────────────────────────────────

class PlaceProductRequest(BaseModel):
    sku: str
    quantity: int
    po_number: Optional[str] = None
    batch_number: str
    expiry_date: Optional[date] = None
    measured_width: Optional[float] = None
    measured_depth: Optional[float] = None
    measured_height: Optional[float] = None
    measured_weight: Optional[float] = None
    warehouse_id: int


class ReceiptItemCreateRequest(BaseModel):
    """
    Used when we only want to capture the receipt and measurements,
    without assigning a shelf or generating suggestions yet.
    """
    sku: str
    quantity: int
    po_number: Optional[str] = None
    batch_number: str
    expiry_date: Optional[date] = None
    measured_width: Optional[float] = None
    measured_depth: Optional[float] = None
    measured_height: Optional[float] = None
    measured_weight: Optional[float] = None
    warehouse_id: int
    scanned_item_id: Optional[str] = None  # MongoDB ID to update status

class ConfirmPlacementRequest(BaseModel):
    receipt_item_id: int
    scanned_item_id: Optional[str] = None  # MongoDB ID to update status


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_or_create_receipt(cur, conn, po_number: Optional[str], warehouse_id: int) -> int:
    """Return an existing open receipt id for this PO, or create a new one."""
    if po_number:
        # Try to find existing pending receipt for this PO
        cur.execute(
            """
            SELECT r.id FROM receipts r
            JOIN purchase_orders po ON r.purchase_order_id = po.id
            WHERE po.po_number = %s AND r.status = 'pending'
            LIMIT 1
            """,
            (po_number,),
        )
        row = cur.fetchone()
        if row:
            return row["id"]

        # Resolve PO id
        cur.execute("SELECT id FROM purchase_orders WHERE po_number = %s", (po_number,))
        po_row = cur.fetchone()
        po_id = po_row["id"] if po_row else None
    else:
        po_id = None

    # Generate receipt number
    cur.execute("SELECT COUNT(*) AS cnt FROM receipts")
    cnt = cur.fetchone()["cnt"]
    receipt_number = f"RCP-{(cnt + 1):05d}"

    cur.execute(
        """
        INSERT INTO receipts (receipt_number, purchase_order_id, status)
        VALUES (%s, %s, 'pending')
        RETURNING id
        """,
        (receipt_number, po_id),
    )
    return cur.fetchone()["id"]


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/placement-suggestions")
def get_placement_suggestions():
    """
    Fetch all pending placement suggestions with related receipt item, product, and shelf details.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT 
                ps.id AS suggestion_id,
                ps.suggested_qty,
                ps.status,
                ps.created_at,
                
                ri.id AS receipt_item_id,
                ri.received_qty,
                ri.batch_number,
                ri.measured_width,
                ri.measured_height,
                ri.measured_depth,
                ri.measured_weight,
                (COALESCE(ri.measured_width, 0) * COALESCE(ri.measured_height, 0) * COALESCE(ri.measured_depth, 0)) AS total_volume,
                
                p.sku,
                p.name AS product_name,
                
                s.id AS shelf_id,
                s.shelf_code,
                z.zone_name,
                s.aisle_num,
                s.bay_num,
                s.level_num,
                
                po.po_number,
                sup.name AS supplier_name
                
            FROM placement_suggestions ps
            JOIN receipt_items ri ON ps.receipt_item_id = ri.id
            JOIN products p ON ri.product_id = p.id
            JOIN shelves s ON ps.shelf_id = s.id
            JOIN zones z ON s.zone_id = z.id
            JOIN receipts r ON ri.receipt_id = r.id
            LEFT JOIN purchase_orders po ON r.purchase_order_id = po.id
            LEFT JOIN suppliers sup ON po.supplier_id = sup.id
            WHERE ps.status = 'pending' AND COALESCE(LOWER(s.status), 'active') = 'active'
            ORDER BY ps.created_at DESC
            """
        )
        suggestions = cur.fetchall()
        return _fix_decimals(suggestions)
    except Exception as e:
        print(f"Error fetching placement suggestions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/suggest-placement")
def suggest_placement(req: PlaceProductRequest):
    """
    1. Look up product by SKU.
    2. Run placement engine to find optimal shelf.
    3. Record as PENDING in receipt_items.
    4. Return shelf suggestion.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Check product
        cur.execute(
            "SELECT id, name FROM products WHERE sku = %s",
            (req.sku,)
        )
        product = cur.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        # Find shelf using measured dimensions from request
        shelf = find_optimal_shelf(
            conn, 
            product["id"], 
            req.quantity, 
            req.warehouse_id,
            measured_width=req.measured_width or 0,
            measured_depth=req.measured_depth or 0,
            measured_height=req.measured_height or 0,
            measured_weight=req.measured_weight or 0
        )
        if not shelf:
            raise HTTPException(status_code=422, detail="No suitable shelf found")

        # Get/Create Receipt
        receipt_id = _get_or_create_receipt(cur, conn, req.po_number, req.warehouse_id)

        # Insert receipt_item (status=suggested)
        total_vol = round(float(req.measured_width or 0) * float(req.measured_height or 0) * float(req.measured_depth or 0), 4)
        cur.execute(
            """
            INSERT INTO receipt_items (
                receipt_id, product_id, received_qty, batch_number, expiry_date,
                measured_width, measured_depth, measured_height, measured_weight,
                assigned_shelf_id, placement_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'suggested')
            RETURNING id
            """,
            (
                receipt_id, product["id"], req.quantity, req.batch_number, req.expiry_date,
                req.measured_width, req.measured_depth, req.measured_height, req.measured_weight,
                shelf["shelf_id"]
            )
        )
        receipt_item_id = cur.fetchone()["id"]

        # -------------------------------------------------------------------
        # NEW: Persist suggestion to `placement_suggestions`
        # -------------------------------------------------------------------
        cur.execute(
            """
            INSERT INTO placement_suggestions (
                receipt_item_id, shelf_id, suggested_qty, status
            ) VALUES (%s, %s, %s, 'pending')
            RETURNING id
            """,
            (receipt_item_id, shelf["shelf_id"], req.quantity)
        )
        suggestion_id = cur.fetchone()["id"]

        conn.commit()

        return _fix_decimals({
            "receipt_item_id": receipt_item_id,
            "suggestion_id": suggestion_id,
            "suggestion": {
                "shelf_id": shelf["shelf_id"],
                "shelf_code": shelf["shelf_code"],
                "total_volume": total_vol,
                "zone_name": shelf["zone_name"],
                "aisle_num": shelf["aisle_num"],
                "bay_num": shelf["bay_num"],
                "level_num": shelf["level_num"]
            }
        })
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"ERROR in suggest_placement: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/create-receipt-item")
async def create_receipt_item(req: ReceiptItemCreateRequest):
    """
    Create / append to a receipt and insert a receipt_items row
    WITHOUT assigning a shelf or generating placement suggestions.
    Used by the scanning flow before the manager runs bulk suggestions.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Check product
        cur.execute(
            "SELECT id, name FROM products WHERE sku = %s",
            (req.sku,),
        )
        product = cur.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        # Get/Create Receipt
        receipt_id = _get_or_create_receipt(cur, conn, req.po_number, req.warehouse_id)

        # Insert receipt_item with no shelf assignment yet
        cur.execute(
            """
            INSERT INTO receipt_items (
                receipt_id, product_id, received_qty, batch_number, expiry_date,
                measured_width, measured_depth, measured_height, measured_weight,
                assigned_shelf_id, placed_qty, placement_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, 0, 'pending')
            RETURNING id
            """,
            (
                receipt_id,
                product["id"],
                req.quantity,
                req.batch_number,
                req.expiry_date,
                req.measured_width,
                req.measured_depth,
                req.measured_height,
                req.measured_weight,
            ),
        )
        receipt_item_id = cur.fetchone()["id"]
        conn.commit()

        # --- Update MongoDB scanned_item status to 'measured' ---
        if req.scanned_item_id:
            try:
                from bson import ObjectId
                await mongodb.scanned_data.update_one(
                    {"_id": ObjectId(req.scanned_item_id)},
                    {"$set": {"status": "measured", "receipt_item_id": receipt_item_id}}
                )
            except Exception as mongo_err:
                print(f"Warning: Failed to update MongoDB status to measured: {mongo_err}")

        return {
            "receipt_id": receipt_id,
            "receipt_item_id": receipt_item_id,
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"ERROR in create_receipt_item: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/generate-bulk-suggestions")
async def generate_bulk_suggestions(warehouse_id: Optional[int] = None):
    """
    For all pending receipt_items without an assigned shelf, run the placement
    engine once per row and generate placement_suggestions.

    Intended to be triggered from the manager Receive page with a single click.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Fetch all pending receipt_items that don't have a shelf yet
        params = []
        warehouse_filter = ""
        if warehouse_id is not None:
            warehouse_filter = "AND po.warehouse_id = %s"
            params.append(warehouse_id)

        cur.execute(
            f"""
            SELECT
                ri.id          AS receipt_item_id,
                ri.received_qty,
                ri.batch_number,
                ri.expiry_date,
                ri.measured_width,
                ri.measured_depth,
                ri.measured_height,
                ri.measured_weight,
                p.id           AS product_id,
                p.sku,
                po.warehouse_id
            FROM receipt_items ri
            JOIN receipts r   ON ri.receipt_id = r.id
            LEFT JOIN purchase_orders po ON r.purchase_order_id = po.id
            JOIN products p   ON ri.product_id = p.id
            WHERE ri.placement_status = 'pending'
              AND ri.assigned_shelf_id IS NULL
              {warehouse_filter}
            """,
            tuple(params),
        )
        rows = cur.fetchall()

        if not rows:
            return {"generated": 0, "suggestions": []}

        # --- NEW: Deduplicate rows by receipt_item_id to ensure unique processing ---
        unique_rows = []
        seen_ri_ids = set()
        for r in rows:
            if r["receipt_item_id"] not in seen_ri_ids:
                unique_rows.append(r)
                seen_ri_ids.add(r["receipt_item_id"])
        rows = unique_rows

        # --- EXTREME OPTIMIZATION: Batch Fetch Shelf and Product Data ---
        # 1. Resolve Warehouse ID (use the first valid one if not passed)
        target_wid = warehouse_id
        if target_wid is None:
            for row in rows:
                if row["warehouse_id"]:
                    target_wid = row["warehouse_id"]
                    break
        
        if not target_wid:
            raise HTTPException(status_code=400, detail="Could not determine warehouse_id for placement.")

        # 2. Fetch all active shelves once
        cur.execute(
            """
            SELECT s.id AS shelf_id, s.shelf_code, s.aisle_num, s.bay_num, s.level_num, 
                   s.bin_num, s.max_weight, s.current_weight, 
                   CAST(s.available_volume AS FLOAT) AS available_volume,
                   z.zone_name, z.product_category
            FROM shelves s
            JOIN zones z ON s.zone_id = z.id
            JOIN floors f ON z.floor_id = f.id
            WHERE f.warehouse_id = %s AND s.status = 'active'
            """,
            (target_wid,)
        )
        # Convert to list of dicts to allow in-memory updates
        all_shelves = [dict(row) for row in cur.fetchall()]

        # 3. Fetch product details for all unique products in rows
        product_ids = list(set(row["product_id"] for row in rows))
        cur.execute(
            "SELECT id, category, handling_type, turnover_rate FROM products WHERE id IN %s",
            (tuple(product_ids),)
        )
        products_map = {p["id"]: p for p in cur.fetchall()}

        # Pre-reserve shelves to SKU based on existing pending suggestions in this warehouse
        cur.execute(
            """
            SELECT ps.shelf_id, p.sku
            FROM placement_suggestions ps
            JOIN receipt_items ri ON ps.receipt_item_id = ri.id
            JOIN products p ON ri.product_id = p.id
            JOIN shelves s ON ps.shelf_id = s.id
            JOIN zones z ON s.zone_id = z.id
            JOIN floors f ON z.floor_id = f.id
            WHERE ps.status = 'pending' AND f.warehouse_id = %s
            """,
            (target_wid,)
        )
        pre_reserved = cur.fetchall()
        shelf_reservations: dict[int, str] = {int(r["shelf_id"]): r["sku"] for r in pre_reserved}

        cur.execute(
            """
            SELECT ps.shelf_id, p.sku, ri.measured_width, ri.measured_depth, ri.measured_height, ri.measured_weight, ps.suggested_qty
            FROM placement_suggestions ps
            JOIN receipt_items ri ON ps.receipt_item_id = ri.id
            JOIN products p ON ri.product_id = p.id
            JOIN shelves s ON ps.shelf_id = s.id
            JOIN zones z ON s.zone_id = z.id
            JOIN floors f ON z.floor_id = f.id
            WHERE ps.status = 'pending' AND f.warehouse_id = %s
            """,
            (target_wid,)
        )
        pending_reserved_usage: dict[tuple[int, str], dict[str, float]] = {}
        for r in cur.fetchall():
            sid = int(r["shelf_id"])
            sku = r["sku"]
            unit_vol = float(r["measured_width"] or 0) * float(r["measured_depth"] or 0) * float(r["measured_height"] or 0)
            unit_wt = float(r["measured_weight"] or 0)
            key = (sid, sku)
            if key not in pending_reserved_usage:
                pending_reserved_usage[key] = {"vol": 0.0, "wt": 0.0}
            pending_reserved_usage[key]["vol"] += unit_vol
            pending_reserved_usage[key]["wt"] += unit_wt

        # Also reserve shelves already holding inventory of a different SKU
        cur.execute(
            """
            SELECT inv.shelf_id, p.sku
            FROM inventory inv
            JOIN products p ON inv.product_id = p.id
            WHERE inv.warehouse_id = %s
            """,
            (target_wid,)
        )
        for r in cur.fetchall():
            sid = int(r["shelf_id"])
            sku = r["sku"]
            if sid not in shelf_reservations:
                shelf_reservations[sid] = sku

        suggestions_out = []
        failures = []
        sku_primary_shelf: dict[str, int] = {}
        # Allow reusing the same shelf across multiple items of the same SKU
        # by tracking capacity in-memory (all_shelves). We no longer block a
        # shelf after first use in this batch; instead we subtract used volume
        # and add weight so repeated selections are naturally limited.

        print(f"DEBUG: Processing {len(rows)} unique receipt items for shelf suggestions")

        for row in rows:
            # Use current in-memory capacity snapshot, but exclude shelves reserved for other SKUs
            current_available = [s for s in all_shelves if shelf_reservations.get(s["shelf_id"]) in (None, row["sku"])]
            
            product = products_map.get(row["product_id"])
            if not product:
                continue

            qty = row["received_qty"]
            u_width = float(row["measured_width"] or 0)
            u_depth = float(row["measured_depth"] or 0)
            u_height = float(row["measured_height"] or 0)
            u_weight = float(row["measured_weight"] or 0)
            # Prefer previously reserved shelf for this SKU if it still fits
            shelf = None
            reasons = {}
            quantity_placed = None
            reserved_shelves = []
            for s in all_shelves:
                if shelf_reservations.get(s["shelf_id"]) != row["sku"]:
                    continue
                reserved_usage = pending_reserved_usage.get((s["shelf_id"], row["sku"]))
                target_shelf = s
                if reserved_usage:
                    target_shelf = dict(s)
                    target_shelf["available_volume"] = max(
                        0.0,
                        float(s.get("available_volume") or 0.0) - float(reserved_usage.get("vol") or 0.0),
                    )
                    target_shelf["current_weight"] = float(s.get("current_weight") or 0.0) + float(reserved_usage.get("wt") or 0.0)
                reserved_shelves.append(target_shelf)

            preferred_sid = sku_primary_shelf.get(row["sku"])
            if preferred_sid is not None:
                preferred = next((s for s in all_shelves if s["shelf_id"] == preferred_sid), None)
                if preferred is not None:
                    reserved_usage = pending_reserved_usage.get((preferred_sid, row["sku"]))
                    target_shelf = preferred
                    if reserved_usage:
                        target_shelf = dict(preferred)
                        target_shelf["available_volume"] = max(
                            0.0,
                            float(preferred.get("available_volume") or 0.0) - float(reserved_usage.get("vol") or 0.0),
                        )
                        target_shelf["current_weight"] = float(preferred.get("current_weight") or 0.0) + float(reserved_usage.get("wt") or 0.0)
                    shelf, reasons, quantity_placed = match_shelf_in_memory(
                        [target_shelf],
                        product,
                        qty,
                        measured_width=u_width,
                        measured_depth=u_depth,
                        measured_height=u_height,
                        measured_weight=u_weight,
                    )

            if shelf is None and reserved_shelves:
                shelf, reasons, quantity_placed = match_shelf_in_memory(
                    reserved_shelves,
                    product,
                    qty,
                    measured_width=u_width,
                    measured_depth=u_depth,
                    measured_height=u_height,
                    measured_weight=u_weight,
                )

            # If no reserved shelf or none found, run normal matching
            if shelf is None:
                shelf, reasons, quantity_placed = match_shelf_in_memory(
                    current_available,
                    product,
                    qty,
                    measured_width=u_width,
                    measured_depth=u_depth,
                    measured_height=u_height,
                    measured_weight=u_weight,
                )
            
            if not shelf:
                print(f"DEBUG: No shelf found for receipt_item_id {row['receipt_item_id']}")
                # Determine primary reason
                reason_str = "No active shelves found"
                if reasons["total_shelves_checked"] > 0:
                    if reasons["category_mismatch"] == reasons["total_shelves_checked"]:
                        reason_str = "No shelves with matching category"
                    elif reasons["insufficient_volume"] > 0:
                        reason_str = "Insufficient volume in available shelves"
                    elif reasons["weight_limit_exceeded"] > 0:
                        reason_str = "Weight limit exceeded in available shelves"
                
                # Update status to failed
                cur.execute(
                    "UPDATE receipt_items SET placement_status = 'failed' WHERE id = %s",
                    (row["receipt_item_id"],),
                )
                
                failures.append({
                    "receipt_item_id": row["receipt_item_id"],
                    "sku": row["sku"],
                    "reason": reason_str
                })
                continue

            # --- SUGGESTION LOGIC (NO AUTO-PLACED) ---
            total_vol = float(u_width * u_depth * u_height) if (u_width and u_depth and u_height) else 0.0
            total_wt = float(u_weight) if u_weight else 0.0
            rem_vol = float(shelf.get("available_volume") or 0.0)
            rem_wt = float(shelf.get("max_weight") or 0.0) - float(shelf.get("current_weight") or 0.0)

            qty_fit = qty
            if quantity_placed:
                qty_fit = quantity_placed

            total_vol = round(total_vol or 0.0, 4)
            total_weight = round(total_wt or 0.0, 4)

            # Reserve shelf for this SKU for the remainder of the batch
            shelf_reservations[shelf["shelf_id"]] = row["sku"]
            if row["sku"] not in sku_primary_shelf:
                sku_primary_shelf[row["sku"]] = shelf["shelf_id"]

            # 1. Update receipt_items to 'suggested'
            cur.execute(
                "UPDATE receipt_items SET assigned_shelf_id = %s, placement_status = 'suggested' WHERE id = %s",
                (shelf["shelf_id"], row["receipt_item_id"]),
            )

            # 2. Insert into placement_suggestions table
            cur.execute(
                """
                INSERT INTO placement_suggestions (
                    receipt_item_id, shelf_id, suggested_qty, status
                ) VALUES (%s, %s, %s, 'pending')
                """,
                (row["receipt_item_id"], shelf["shelf_id"], qty_fit)
            )

            # 3. Update in-memory for next iterations in same bulk request (capacity tracking)
            for s in all_shelves:
                if s["shelf_id"] == shelf["shelf_id"]:
                    s["available_volume"] = float(s["available_volume"]) - total_vol
                    s["current_weight"] = float(s["current_weight"]) + total_weight

            # 3b. Persist reservation to shelves (increment used_volume and current_weight; available_volume is generated)
            cur.execute(
                """
                UPDATE shelves
                SET used_volume = used_volume + %s,
                    current_weight = current_weight + %s
                WHERE id = %s
                """,
                (total_vol, total_weight, shelf["shelf_id"])
            )

            # 4. Update MongoDB Status to 'suggested'
            try:
                await mongodb.scanned_data.update_many(
                    {"receipt_item_id": row["receipt_item_id"]},
                    {"$set": {"status": "suggested"}}
                )
            except Exception as mongo_err:
                print(f"Warning: MongoDB suggested update failed: {mongo_err}")

            # 5. Record for output
            suggestions_out.append(
                _fix_decimals(
                    {
                        "receipt_item_id": row["receipt_item_id"],
                        "shelf_id": shelf["shelf_id"],
                        "shelf_code": shelf["shelf_code"],
                        "total_volume": total_vol,
                        "zone_name": shelf["zone_name"],
                        "aisle_num": shelf["aisle_num"],
                        "bay_num": shelf["bay_num"],
                        "level_num": shelf["level_num"],
                        "suggested_qty": qty_fit,
                        "status": "pending"
                    }
                )
            )

        conn.commit()
        return {
            "generated": len(suggestions_out),
            "failed": len(failures),
            "suggestions": suggestions_out,
            "failures": failures
        }
    except Exception as e:
        conn.rollback()
        print(f"ERROR in generate_bulk_suggestions: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.post("/confirm-placement")
async def confirm_placement(req: ConfirmPlacementRequest):
    """Confirm a pending placement: updates inventory and shelf capacity."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Fetch receipt item details with warehouse_id from the shelf hierarchy
        cur.execute(
            """
            SELECT ri.*, p.sku, p.name, f.warehouse_id
            FROM receipt_items ri
            JOIN products p ON ri.product_id = p.id
            JOIN shelves s ON ri.assigned_shelf_id = s.id
            JOIN zones z ON s.zone_id = z.id
            JOIN floors f ON z.floor_id = f.id
            WHERE ri.id = %s AND ri.placement_status IN ('pending', 'suggested')
            """,
            (req.receipt_item_id,)
        )
        ri = cur.fetchone()
        if not ri:
            raise HTTPException(status_code=404, detail="Pending placement not found")

        shelf_id = ri["assigned_shelf_id"]
        product_id = ri["product_id"]
        qty = ri["received_qty"]
        warehouse_id = ri["warehouse_id"]

        # Block placement into inactive shelves
        cur.execute("SELECT status FROM shelves WHERE id = %s", (shelf_id,))
        srow = cur.fetchone()
        if not srow or str(srow["status"] or "").lower() != "active":
            raise HTTPException(status_code=400, detail="Assigned shelf is inactive")

        # Calculate volume/weight based on MEASURED dimensions (Total for the box/batch)
        total_vol = round(float(ri["measured_width"] or 0) * float(ri["measured_depth"] or 0) * float(ri["measured_height"] or 0), 4)
        total_weight = round(float(ri["measured_weight"] or 0), 4)

        # Upsert Inventory
        cur.execute(
            """
            INSERT INTO inventory (
                product_id, shelf_id, warehouse_id, batch_number, quantity,
                total_volume, total_weight, expiry_date, received_date, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_DATE, 'available')
            ON CONFLICT (product_id, shelf_id, batch_number) DO UPDATE
            SET quantity = inventory.quantity + EXCLUDED.quantity,
                total_volume = inventory.total_volume + EXCLUDED.total_volume,
                total_weight = inventory.total_weight + EXCLUDED.total_weight
            """,
            (product_id, shelf_id, warehouse_id, ri["batch_number"], qty, total_vol, total_weight, ri["expiry_date"])
        )

        # Update Status
        cur.execute(
            "UPDATE receipt_items SET placement_status = 'placed', placed_qty = %s WHERE id = %s",
            (qty, req.receipt_item_id)
        )

        # Update placement_suggestions status to 'completed'
        cur.execute(
            "UPDATE placement_suggestions SET status = 'completed' WHERE receipt_item_id = %s AND status = 'pending'",
            (req.receipt_item_id,)
        )

        # -------------------------------------------------------------------
        # NEW: Delete from MongoDB `placement_shelf_suggestions`
        # -------------------------------------------------------------------
        try:
            await mongodb.placement_shelf_suggestions.delete_many({"receipt_item_id": req.receipt_item_id})
            # Update scanned_item status to 'place_pending'
            if req.scanned_item_id:
                from bson import ObjectId
                await mongodb.scanned_data.update_one(
                    {"_id": ObjectId(req.scanned_item_id)},
                    {"$set": {"status": "place_pending"}}
                )
        except Exception as mongo_err:
            print(f"Warning: Failed to update MongoDB: {mongo_err}")

        conn.commit()
        return {"status": "success", "message": "Placement confirmed"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"ERROR in confirm_placement: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/putaway-tasks")
def get_putaway_tasks(warehouse_id: Optional[int] = None, zone_id: Optional[int] = None):
    """
    Returns a list of receipt items with 'suggested' status, 
    including product info, shelf info, and distance from Inbound Dock.
    Optional filtering by warehouse_id or zone_id.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1. Fetch Inbound Dock for distance calculation
        cur.execute("""
            SELECT area_name, location_x, location_y 
            FROM areas 
            WHERE (area_type IN ('Inbound Dock', 'Inbound Docks', 'DOCK') OR area_name ILIKE '%Dock%')
            LIMIT 1
        """)
        dock = cur.fetchone()
        dock_x = float(dock["location_x"]) if dock else 0.0
        dock_y = float(dock["location_y"]) if dock else 0.0
        dock_name = dock["area_name"] if dock else "Dock Area"

        # 2. Fetch suggested items
        params = []
        where_clauses = ["ri.placement_status = 'suggested'"]
        
        if warehouse_id:
            where_clauses.append("po.warehouse_id = %s")
            params.append(warehouse_id)
            
        if zone_id:
            where_clauses.append("s.zone_id = %s")
            params.append(zone_id)

        where_stmt = " AND ".join(where_clauses)

        cur.execute(
            f"""
            SELECT 
                ri.id,
                p.name as product_name,
                p.sku,
                ri.received_qty as quantity,
                ri.measured_weight as weight,
                s.shelf_code,
                s.location_x as shelf_x,
                s.location_y as shelf_y,
                s.level_num,
                ri.batch_number,
                po.po_number,
                ri.placement_status as priority
            FROM receipt_items ri
            JOIN products p ON ri.product_id = p.id
            LEFT JOIN shelves s ON ri.assigned_shelf_id = s.id
            LEFT JOIN receipts r ON ri.receipt_id = r.id
            LEFT JOIN purchase_orders po ON r.purchase_order_id = po.id
            WHERE {where_stmt}
              AND COALESCE(LOWER(s.status), 'active') = 'active'
            ORDER BY ri.created_at ASC
            """,
            tuple(params),
        )
        rows = cur.fetchall()
        
        # 3. Process tasks and calculate distances
        raw_tasks = []
        for r in rows:
            s_x = float(r["shelf_x"] or 0)
            s_y = float(r["shelf_y"] or 0)
            distance = round(abs(dock_x - s_x) + abs(dock_y - s_y))
            
            raw_tasks.append({
                "id": r["id"],
                "product": r["product_name"],
                "sku": r["sku"],
                "quantity": r["quantity"],
                "po_number": r["po_number"],
                "weight": float(r["weight"] or 0),
                "from": dock_name,
                "to": r["shelf_code"],
                "level": int(r["level_num"] or 1),
                "distance_val": distance,
                "distance": f"{distance}m",
                "priority": "high" if r["priority"] == "suggested" else "normal"
            })

        # 4. Sort by distance for logical sequencing
        raw_tasks.sort(key=lambda x: x["distance_val"])

        # 5. Batching / Sequencing Logic according to Equipment
        # Equipment Specs:
        # Pallet Jack: 1500kg, Level 1
        # Forklift: 2500kg, Level 1-3
        # Reach Truck: 1500kg, Level 1-6
        
        paths = []
        if not raw_tasks:
            return []

        current_path_tasks = []
        current_weight = 0
        current_max_lvl = 0

        def get_best_equipment(max_lvl, total_weight):
            if max_lvl > 3:
                return {"type": "Reach Truck", "limit": 1500}
            if max_lvl > 1:
                return {"type": "Standard Forklift", "limit": 2500}
            # Level 1 case: Pallet Jack if weight <= 1500, else Forklift
            if total_weight > 1500:
                return {"type": "Standard Forklift", "limit": 2500}
            return {"type": "Pallet Jack", "limit": 1500}

        for task in raw_tasks:
            t_weight = task["weight"]
            t_lvl = task["level"]
            
            # Check if we can add this task to current path
            temp_max_lvl = max(current_max_lvl, t_lvl)
            temp_weight = current_weight + t_weight
            
            # Decide equipment for this potential new batch
            equip = get_best_equipment(temp_max_lvl, temp_weight)
            
            if temp_weight <= equip["limit"] and (current_max_lvl == 0 or temp_max_lvl <= equip.get("max_h", 100)): # simplified height check
                # Note: max_h logic is handled by get_best_equipment logic actually
                current_path_tasks.append(task)
                current_weight = temp_weight
                current_max_lvl = temp_max_lvl
            else:
                # Close current path and start new one
                if current_path_tasks:
                    final_equip = get_best_equipment(current_max_lvl, current_weight)
                    paths.append({
                        "equipment": final_equip["type"],
                        "total_weight": f"{current_weight:.1f}kg",
                        "tasks": current_path_tasks
                    })
                
                current_path_tasks = [task]
                current_weight = t_weight
                current_max_lvl = t_lvl

        # Final path
        if current_path_tasks:
            final_equip = get_best_equipment(current_max_lvl, current_weight)
            paths.append({
                "equipment": final_equip["type"],
                "total_weight": f"{current_weight:.1f}kg",
                "tasks": current_path_tasks
            })

        return paths
    except Exception as e:
        print(f"ERROR in get_putaway_tasks: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.get("/pending-placements")
def get_pending_placements(warehouse_id: Optional[int] = None):
    """
    Return all receipt items that have an assigned shelf but are not yet fully
    processed (e.g., status is 'suggested' or 'placed'). This is used to
    visually highlight pending placements in the 3D warehouse view with
    accurate box sizes from the measured item dimensions.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        params = []
        warehouse_filter = ""
        # Assuming we can join with receipts and purchase_orders to get warehouse_id
        if warehouse_id:
            warehouse_filter = "AND po.warehouse_id = %s"
            params.append(warehouse_id)

        cur.execute(
            f"""
            SELECT 
                ri.assigned_shelf_id AS shelf_id,
                ri.measured_volume AS total_volume,
                ri.placement_status AS status,
                ri.measured_width,
                ri.measured_depth,
                ri.measured_height,
                p.sku
            FROM receipt_items ri
            LEFT JOIN receipts r ON ri.receipt_id = r.id
            LEFT JOIN purchase_orders po ON r.purchase_order_id = po.id
            LEFT JOIN products p ON ri.product_id = p.id
            WHERE ri.assigned_shelf_id IS NOT NULL
              AND ri.placement_status IN ('suggested', 'placed', 'pending')
              {warehouse_filter}
            """,
            tuple(params),
        )
        rows = cur.fetchall()
        return [_fix_decimals(dict(r)) for r in rows]
    except Exception as e:
        print(f"ERROR in get_pending_placements: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.get("/inventory-shelf-view")
def inventory_shelf_view(warehouse_id: Optional[int] = None):
    """
    Return all inventory rows joined with product and shelf information.
    Used by the Products-in-Shelf frontend page.
    """
    conn = get_conn()
    cur = conn.cursor()
    try:
        params = []
        warehouse_filter = ""
        if warehouse_id:
            warehouse_filter = "WHERE inv.warehouse_id = %s"
            params.append(warehouse_id)

        cur.execute(
            f"""
            SELECT
                inv.id              AS inventory_id,
                inv.batch_number,
                inv.quantity,
                inv.allocated,
                inv.available,
                inv.total_volume,
                inv.total_weight,
                inv.expiry_date,
                inv.received_date,
                inv.status          AS inventory_status,

                p.id                AS product_id,
                p.sku,
                p.name              AS product_name,
                p.category,
                p.handling_type,
                p.turnover_rate,

                s.id                AS shelf_id,
                s.shelf_code,
                s.aisle_num,
                s.bay_num,
                s.level_num,
                s.bin_num,
                CAST(s.available_volume AS FLOAT) AS shelf_available_volume,
                s.max_weight,
                s.current_weight    AS shelf_current_weight,

                z.zone_name,
                z.zone_type,

                inv.warehouse_id
            FROM inventory inv
            JOIN products p ON inv.product_id = p.id
            JOIN shelves  s ON inv.shelf_id   = s.id
            JOIN zones    z ON s.zone_id       = z.id
            {warehouse_filter}
            ORDER BY inv.received_date DESC, inv.id DESC
            """,
            params,
        )
        rows = cur.fetchall()

        # Convert to list of dicts and fix Decimals
        result = [_fix_decimals(dict(r)) for r in rows]
        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in inventory_shelf_view: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
