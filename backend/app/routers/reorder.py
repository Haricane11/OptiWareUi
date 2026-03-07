"""Reorder router — on-demand reorder check and trigger."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import ReorderCheckResponse
from app.services.reorder_service import ReorderService
from app.models.reorder_policy import ReorderPolicy
from app.models.products import Product
from app.models.inventory import Inventory
from app.models.supplier import Supplier
from app.models.purchase import PurchaseOrder, PurchaseOrderItem

router = APIRouter(prefix="/reorder", tags=["Automatic Reorder"])


@router.get("/suggestions")
async def reorder_suggestions(
    limit: int = 50,
    offset: int = 0,
    urgency: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List products that need reordering based on their reorder policy.
    Only returns items where stock <= ROP by default.
    Supports pagination (limit/offset) and urgency filter.
    """
    # Correlated subquery for available stock
    avail_subq = (
        func.coalesce(
            select(func.sum(Inventory.available))
            .where(
                Inventory.product_id == ReorderPolicy.product_id,
                Inventory.status == "ACTIVE",
            )
            .correlate(ReorderPolicy)
            .scalar_subquery(),
            0,
        )
    )

    # Subquery: product_ids that already have open (DRAFT or ORDERED) AUTO- POs
    open_po_subq = (
        select(PurchaseOrderItem.product_id)
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrder.po_number.like("AUTO-%"),
            PurchaseOrder.status.in_(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"]),
        )
        .scalar_subquery()
    )

    stmt = (
        select(
            ReorderPolicy.product_id.label("product_id"),
            ReorderPolicy.reorder_point.label("reorder_point"),
            ReorderPolicy.safety_stock.label("safety_stock"),
            ReorderPolicy.eoq.label("eoq"),
            ReorderPolicy.lead_time_days.label("lead_time_days"),
            Product.id.label("prod_id"),
            Product.sku.label("sku"),
            Product.name.label("product_name"),
            Product.unit_price.label("unit_price"),
            Supplier.name.label("supplier_name"),
            avail_subq.label("available_stock"),
        )
        .join(Product, ReorderPolicy.product_id == Product.id)
        .outerjoin(Supplier, Product.supplier_id == Supplier.id)
        .where(
            ReorderPolicy.reorder_point.isnot(None),
            ReorderPolicy.reorder_point > 0,
            avail_subq <= ReorderPolicy.reorder_point,  # Only items needing reorder
            ReorderPolicy.product_id.notin_(open_po_subq),  # Exclude items with open POs
        )
    )

    result = await db.execute(stmt)
    rows = result.mappings().all()

    suggestions = []
    for row in rows:
        rop = row["reorder_point"] or 0
        avail = int(row["available_stock"])
        eoq = row["eoq"] or 0
        lead = row["lead_time_days"] or 0
        unit_price_val = row.get("unit_price")
        unit_price = float(unit_price_val) if unit_price_val is not None else 0

        if avail <= 0 or (rop > 0 and avail < rop * 0.25):
            urg = "critical"
        elif rop > 0 and avail <= rop:
            urg = "moderate"
        else:
            urg = "low"

        suggestions.append({
            "product_id": row["product_id"],
            "product_name": row["product_name"],
            "sku": row["sku"],
            "current_stock": avail,
            "reorder_point": rop,
            "eoq": eoq,
            "safety_stock": row["safety_stock"] or 0,
            "lead_time_days": lead,
            "estimated_cost": round(eoq * unit_price, 2),
            "supplier_name": row["supplier_name"] or "—",
            "urgency": urg,
        })

    # Sort: critical first, then moderate, then low
    order_map = {"critical": 0, "moderate": 1, "low": 2}
    suggestions.sort(key=lambda s: (order_map.get(s["urgency"], 3), -s["product_id"]))

    # Urgency filter
    if urgency:
        suggestions = [s for s in suggestions if s["urgency"] == urgency]

    total = len(suggestions)
    suggestions = suggestions[offset:offset + limit]

    return {"suggestions": suggestions, "total": total}


@router.get("/history")
async def reorder_history(
    from_date: str | None = None,
    to_date: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List all auto-generated Purchase Orders with product details.
    Supports date range filtering via from_date and to_date (YYYY-MM-DD).
    """
    from datetime import datetime, date

    stmt = (
        select(
            PurchaseOrder,
            PurchaseOrderItem.product_id,
            PurchaseOrderItem.ordered_qty,
            Product.name.label("product_name"),
            Product.sku.label("product_sku"),
            Supplier.name.label("supplier_name"),
        )
        .join(PurchaseOrderItem, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .join(Product, PurchaseOrderItem.product_id == Product.id)
        .outerjoin(Supplier, PurchaseOrder.supplier_id == Supplier.id)
        .where(PurchaseOrder.po_number.like("AUTO-%"))
        .order_by(PurchaseOrder.created_at.desc())
    )

    if from_date:
        try:
            fd = datetime.strptime(from_date, "%Y-%m-%d")
            stmt = stmt.where(PurchaseOrder.created_at >= fd)
        except ValueError:
            pass
    if to_date:
        try:
            td = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            stmt = stmt.where(PurchaseOrder.created_at <= td)
        except ValueError:
            pass

    result = await db.execute(stmt)
    rows = result.all()

    history = []
    for po, product_id, ordered_qty, product_name, product_sku, supplier_name in rows:
        history.append({
            "po_id": po.id,
            "po_number": po.po_number,
            "product_id": product_id,
            "product_name": product_name,
            "product_sku": product_sku,
            "ordered_qty": ordered_qty,
            "supplier_name": supplier_name or "—",
            "status": po.status,
            "created_at": po.created_at.isoformat() if po.created_at else None,
        })

    return {"history": history, "total": len(history)}


@router.post("/check/{product_id}", response_model=ReorderCheckResponse)
async def check_reorder(product_id: int, db: AsyncSession = Depends(get_db)):
    """Check if a product needs reordering and create a PO if needed."""
    async with db.begin():
        result = await ReorderService.check_and_reorder(db, product_id)
    return result


@router.post("/check-all")
async def check_all_reorder(db: AsyncSession = Depends(get_db)):
    """Run reorder check for all products with a reorder policy."""
    async with db.begin():
        results = await ReorderService.check_all_products(db)
    return {"results": results}
