from fastapi import APIRouter, HTTPException

from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from bson import ObjectId

from app.database import mongodb

router = APIRouter(
    prefix="/purchase-invoices",
    tags=["Purchase Invoices"]
)


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
