import asyncio
from app.core.database import async_session_factory
from sqlalchemy import select, func
from app.models.products import Product
from app.models.reorder_policy import ReorderPolicy
from app.models.inventory import Inventory
from app.services.inventory_health_service import InventoryHealthService

async def main():
    async with async_session_factory() as db:
        # Reorder Logic Query (The one we fixed in reorder.py)
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

        reorder_stmt = (
            select(ReorderPolicy.product_id, Product.name, avail_subq.label('avail'), ReorderPolicy.reorder_point)
            .join(Product, ReorderPolicy.product_id == Product.id)
            .where(
                ReorderPolicy.reorder_point.isnot(None),
                ReorderPolicy.reorder_point > 0,
                avail_subq <= ReorderPolicy.reorder_point,
            )
        )
        reorder_items = (await db.execute(reorder_stmt)).all()
        reorder_dict = {row[0]: dict(row._mapping) for row in reorder_items}

        # Health Detection Logic (The one we fixed in inventory_health_service.py)
        config = await InventoryHealthService.get_or_create_config(db)
        health_low_records = await InventoryHealthService.detect_low_stock(db, config)
        health_ids = {r.product_id for r in health_low_records}

        print(f"Items needing reorder (Logic): {len(reorder_dict)}")
        print(f"Items detected as LOW stock (Logic): {len(health_ids)}")

        missing_from_health = set(reorder_dict.keys()) - health_ids
        extra_in_health = health_ids - set(reorder_dict.keys())

        print(f"Mismatch: Missing from Health: {len(missing_from_health)}, Extra in Health: {len(extra_in_health)}")
        
        if missing_from_health:
            print("Missing IDs:", missing_from_health)
        if extra_in_health:
            # Note: Reorder suggestions excludes items with open POs.
            # detect_low_stock does NOT exclude items with open POs.
            # So extra_in_health should contain those with open POs.
            print(f"Items with open POs (expected to be extra): {len(extra_in_health)}")

asyncio.run(main())
