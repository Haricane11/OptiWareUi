import asyncio
from sqlalchemy.future import select
from sqlalchemy import func
from app.core.database import async_session_factory
from app.models.products import Product
from app.models.orders import DeliveryNote, DeliveryNoteItem, SalesOrderItem
from app.models.inventory_health_analytics import InventoryHealthAnalytics
from app.services.inventory_classification_service import InventoryClassificationService

async def inspect():
    async with async_session_factory() as db:
        stmt = select(Product.id).where(Product.status == "ACTIVE").order_by(Product.id).limit(10)
        prods = (await db.execute(stmt)).scalars().all()
        
        for pid in prods:
            last_shipment_stmt = (
                select(func.max(DeliveryNote.shipped_at))
                .join(DeliveryNoteItem, DeliveryNoteItem.delivery_note_id == DeliveryNote.id)
                .join(SalesOrderItem, DeliveryNoteItem.sales_order_item_id == SalesOrderItem.id)
                .where(
                    SalesOrderItem.product_id == pid,
                    DeliveryNote.status == "DELIVERED"
                )
            )
            last_shipped = (await db.execute(last_shipment_stmt)).scalar()
            print(f"Prod {pid} Last Shipped: {last_shipped}")
            
            # Recalculate directly
            record = await InventoryClassificationService.compute_inventory_health(db, pid)
            print(f"Prod {pid} Recalculated Health: {record.classification}, score={record.dead_stock_severity_score}, days={record.days_since_last_sale}")

asyncio.run(inspect())
