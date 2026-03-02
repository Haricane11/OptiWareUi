import traceback
from fastapi import APIRouter, HTTPException

from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel
from app.mongodb import mongodb
from app.routers.notifications import NotificationCreate, create_notification

router = APIRouter(
    prefix="/purchase-invoices",
    tags=["Purchase Invoices"]
)

# Define a Pydantic model for the request body
class InvoiceStatusUpdate(BaseModel):
    status: str


def serialize_invoice(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("")
async def list_purchase_invoices():
    try:
        cursor = mongodb.purchase_invoices.find({}, sort=[("created_at", -1)])
        documents = await cursor.to_list(length=200)
        return [serialize_invoice(doc) for doc in documents]
    except Exception as e:
        print(f"Error in list_purchase_invoices: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}", response_model=Dict[str, Any])
async def get_purchase_invoice(invoice_id: str) -> Dict[str, Any]:
    try:
        object_id = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invoice ID")

    document = await mongodb.purchase_invoices.find_one({"_id": object_id})

    if not document:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return serialize_invoice(document)


@router.get("/by-po-number/{po_number}", response_model=Dict[str, Any])
async def get_purchase_invoice_by_po_number(po_number: str) -> Dict[str, Any]:
    document = await mongodb.purchase_invoices.find_one({"po_number": po_number})

    if not document:
        raise HTTPException(status_code=404, detail=f"Invoice with PO number {po_number} not found")

    return serialize_invoice(document)


@router.patch("/by-po-number/{po_number}/status")
async def update_invoice_status_by_po_number(po_number: str, update: InvoiceStatusUpdate):
    from datetime import datetime
    document = await mongodb.purchase_invoices.find_one({"po_number": po_number})

    if not document:
        raise HTTPException(status_code=404, detail=f"Invoice with PO number {po_number} not found")

    new_status = update.status

    if document.get("invoice_status") == new_status:
        await mongodb.purchase_invoices.update_one(
            {"po_number": po_number},
            {"$set": {"updated_at": datetime.now()}}
        )
        return {"message": f"Invoice with PO number {po_number} status is already '{new_status}'."}

    update_result = await mongodb.purchase_invoices.update_one(
        {"po_number": po_number},
        {"$set": {"invoice_status": new_status, "updated_at": datetime.now()}}
    )

    if update_result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Invoice with PO number {po_number} not found")

    return {"message": f"Invoice with PO number {po_number} status updated to {new_status}."}


@router.post("/generate-from-po/{po_id}")
async def generate_invoice_from_po(po_id: int):
    from .purchase_orders import get_purchase_order
    from datetime import datetime

    # 1. Fetch PO details
    try:
        po = get_purchase_order(po_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching PO: {str(e)}")

    # 2. Generate Invoice Number
    year_str = datetime.now().strftime("%Y")
    invoice_number = f"INV-{year_str}-{str(po_id).zfill(3)}"

    # 3. Construct the invoice document
    invoice_doc = {
        "invoice_number": invoice_number,
        "invoice_date": datetime.now(),
        "po_number": po["po_number"],
        "supplier": {
            "name": po["supplier_name"],
            "address": po["supplier_address"],
            "contact": {
                "person": po["supplier_contact_person"],
                "email": po["supplier_email"],
                "phone": po["supplier_phone"]
            }
        },
        "warehouse": {
            "name": po["warehouse_name"],
            "location": po.get("warehouse_location") or "Unknown" # Need to check if warehouse location is in PO
        },
        "invoice_status": "Pending",
        "line_items": [
            {
                "sku": item["sku"],
                "item_description": item["product_name"],
                "quantity": item["qty"],
                "unit_price": item["unit_price"],
                "batch_number": f"BATCH-{item['sku']}-{datetime.now().strftime('%Y%m%d')}",
                "expiry_date": None,
                "total": item["line_total"]
            }
            for item in po["items"]
        ],
        "invoice_total": po["total_amount"],
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    }

    # 4. Save to MongoDB
    try:
        result = await mongodb.purchase_invoices.insert_one(invoice_doc)
        invoice_doc["id"] = str(result.inserted_id)
        # Remove _id if it was added by insert_one to return it safely
        invoice_doc.pop("_id", None)

        # Create a notification for the new invoice
        notification_message = f"Purchase invoice {invoice_doc['invoice_number']} is arrived! with date {invoice_doc['invoice_date'].strftime('%Y-%m-%d')}."
        notification_data = NotificationCreate(
            user_id="all", # Or specific user IDs if applicable
            message=notification_message,
            type="invoice_created",
            related_id=invoice_doc["id"] # Ensure this is the string 'id'
        )
        await create_notification(notification_data)

        return invoice_doc
    except Exception as e:
        print(f"Error saving to MongoDB: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving invoice: {str(e)}")


@router.delete("/{invoice_id}")
async def delete_purchase_invoice(invoice_id: str):
    try:
        object_id = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invoice ID")

    result = await mongodb.purchase_invoices.delete_one({"_id": object_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return {"message": "Invoice deleted successfully"}
