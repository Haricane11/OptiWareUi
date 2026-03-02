from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from app.mongodb import mongodb
from bson import ObjectId
import traceback
from app.routers.purchase_invoices import get_purchase_invoice_by_po_number

router = APIRouter(
    prefix="/scanned-items",
    tags=["Scanned Items"]
)

class ScannedItem(BaseModel):
    sku: str
    quantity: int
    po_ref: str
    invoice_number: str | None = None
    supplier_name: str | None = None
    status: str | None = None # New field for scan status
    timestamp: datetime = Field(default_factory=datetime.now)
    invoice_line_items: List[Dict[str, Any]] | None = None
    receipt_item_id: int | None = None
    suggestion: Dict[str, Any] | None = None
    id: Optional[str] = None

class ScannedItemUpdate(BaseModel):
    receipt_item_id: Optional[int] = None
    suggestion: Optional[Dict[str, Any]] = None
    status: Optional[str] = None

def serialize_scanned_item(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return doc
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    
    # Recursively clean nested dicts (like suggestion)
    for k, v in doc.items():
        if isinstance(v, dict):
            v.pop("_id", None)
            if "scanned_item_id" in v: v.pop("scanned_item_id")
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    item.pop("_id", None)
    return doc

@router.patch("/{item_id}", response_model=ScannedItem)
async def update_scanned_item(item_id: str, update_data: ScannedItemUpdate):
    try:
        print(f"Received PATCH for item {item_id} with data: {update_data}")
        obj_id = ObjectId(item_id)
        update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
        
        if not update_dict:
            print("Warning: No data provided for update")
            raise HTTPException(status_code=400, detail="No data provided for update")

        result = await mongodb.scanned_data.update_one(
            {"_id": obj_id},
            {"$set": update_dict}
        )
        print(f"Update result: matched={result.matched_count}, modified={result.modified_count}")

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Scanned item not found")

        # If suggestion is provided, also store/update it in the dedicated collection
        if update_data.suggestion:
            suggestion_doc = update_data.suggestion.copy()
            suggestion_doc["scanned_item_id"] = item_id
            if update_data.receipt_item_id:
                suggestion_doc["receipt_item_id"] = update_data.receipt_item_id
            
            await mongodb.placement_shelf_suggestions.update_one(
                {"scanned_item_id": item_id},
                {"$set": suggestion_doc},
                upsert=True
            )

        updated_doc = await mongodb.scanned_data.find_one({"_id": obj_id})
        
        # Hydrate suggestion from dedicated collection
        suggestion_doc = await mongodb.placement_shelf_suggestions.find_one({"scanned_item_id": item_id})
        if suggestion_doc:
            updated_doc["suggestion"] = suggestion_doc
            updated_doc["receipt_item_id"] = suggestion_doc.get("receipt_item_id")

        if updated_doc.get("po_ref"):
             try:
                invoice = await get_purchase_invoice_by_po_number(updated_doc["po_ref"])
                updated_doc["invoice_line_items"] = invoice.get("line_items", [])
                updated_doc["invoice_total_weight_kg"] = invoice.get("total_gross_weight_kg")
             except HTTPException:
                pass # Ignore if invoice not found during update return

        return serialize_scanned_item(updated_doc)
    except Exception as e:
        print(f"Error updating scanned item: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=ScannedItem)
async def create_scanned_item(item: ScannedItem):
    try:
        print(f"Received item for creation: {item.model_dump_json()}")
        item_dict = item.model_dump()
        print(f"Item dictionary for MongoDB insertion: {item_dict}")
        result = await mongodb.scanned_data.insert_one(item_dict)
        new_item_doc = await mongodb.scanned_data.find_one({"_id": result.inserted_id})

        if item.po_ref:
            try:
                invoice = await get_purchase_invoice_by_po_number(item.po_ref)
                new_item_doc["invoice_line_items"] = invoice.get("line_items", [])
                new_item_doc["invoice_total_weight_kg"] = invoice.get("total_gross_weight_kg")
            except HTTPException as e:
                if e.status_code == 404:
                    print(f"Warning: Invoice for PO_Ref {item.po_ref} not found when creating scanned item.")
                else:
                    raise e

        return serialize_scanned_item(new_item_doc)
    except Exception as e:
        print(f"Error creating scanned item: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

from app.mongodb import mongodb, get_conn

@router.get("/", response_model=List[ScannedItem])
async def get_all_scanned_items():
    conn = None
    cur = None
    try:
        cursor = mongodb.scanned_data.find({}, sort=[("timestamp", -1)])
        documents = await cursor.to_list(length=100) # Limit to last 100 scanned items

        # Collect receipt_item_ids to fetch suggestions
        receipt_item_ids = [doc["receipt_item_id"] for doc in documents if doc.get("receipt_item_id")]
        
        suggestions_map = {}
        if receipt_item_ids:
            try:
                conn = get_conn()
                cur = conn.cursor()
                format_strings = ','.join(['%s'] * len(receipt_item_ids))
                cur.execute(
                    f"""
                    SELECT 
                        ps.receipt_item_id, 
                        ps.suggested_qty, 
                        ps.status,
                        s.id as shelf_id,
                        s.shelf_code,
                        s.aisle_num,
                        s.bay_num,
                        s.level_num,
                        z.zone_name
                    FROM placement_suggestions ps
                    JOIN shelves s ON ps.shelf_id = s.id
                    JOIN zones z ON s.zone_id = z.id
                    WHERE ps.receipt_item_id IN ({format_strings})
                    AND ps.status = 'pending'
                    """,
                    tuple(receipt_item_ids)
                )
                rows = cur.fetchall()
                for row in rows:
                    suggestions_map[row["receipt_item_id"]] = {
                        "shelf_id": row["shelf_id"],
                        "shelf_code": row["shelf_code"],
                        "zone_name": row["zone_name"],
                        "aisle_num": row["aisle_num"],
                        "bay_num": row["bay_num"],
                        "level_num": row["level_num"],
                        "suggested_qty": row["suggested_qty"],
                        "status": row["status"]
                    }
            except Exception as e:
                print(f"Error fetching placement suggestions: {e}")
                # Don't fail the whole request if PG query fails
            finally:
                if cur: cur.close()
                if conn: conn.close()

        # 2. Get suggestions from specialized MongoDB collection
        scanned_item_ids = [str(doc["_id"]) for doc in documents]
        mongo_suggestions_cursor = mongodb.placement_shelf_suggestions.find({"scanned_item_id": {"$in": scanned_item_ids}})
        mongo_suggestions = await mongo_suggestions_cursor.to_list(length=100)
        mongo_suggestions_map = {s["scanned_item_id"]: s for s in mongo_suggestions}

        for doc in documents:
            # 1. Hydrate Invoice
            if doc.get("po_ref"):
                try:
                    invoice = await get_purchase_invoice_by_po_number(doc["po_ref"])
                    doc["invoice_line_items"] = invoice.get("line_items", [])
                    doc["invoice_total_weight_kg"] = invoice.get("total_gross_weight_kg")
                except HTTPException as e:
                    if e.status_code == 404:
                        print(f"Warning: Invoice for PO_Ref {doc['po_ref']} not found when retrieving scanned item.")
                    else:
                        raise e
            
            # 2. Hydrate Suggestion (Priority: MongoDB specialized collection -> PG (if still pending) -> Scanned data record)
            sid = str(doc["_id"])
            if sid in mongo_suggestions_map:
                doc["suggestion"] = mongo_suggestions_map[sid]
                doc["receipt_item_id"] = mongo_suggestions_map[sid].get("receipt_item_id")
            elif doc.get("receipt_item_id") and doc["receipt_item_id"] in suggestions_map:
                doc["suggestion"] = suggestions_map[doc["receipt_item_id"]]
                
        return [serialize_scanned_item(doc) for doc in documents]
    except Exception as e:
        print(f"Error retrieving scanned items: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
