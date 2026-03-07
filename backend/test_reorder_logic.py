import asyncio
from sqlalchemy import select, func
from app.core.database import async_session_factory
from app.models.reorder_policy import ReorderPolicy
from app.models.products import Product
from app.models.inventory import Inventory

async def compare_logic():
    async with async_session_factory() as db:
        # Reorder module logic (96)
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
        
        reorder_stmt = select(ReorderPolicy.product_id).where(
            ReorderPolicy.reorder_point.isnot(None),
            avail_subq <= ReorderPolicy.reorder_point
        )
        reorder_items = (await db.execute(reorder_stmt)).scalars().all()
        print(f"Items matching Reorder Logic: {len(reorder_items)}")

        # Inventory Health logic (63)
        health_stmt = select(ReorderPolicy.product_id).where(
            ReorderPolicy.reorder_point.isnot(None),
            ReorderPolicy.reorder_point > 0,
            avail_subq <= ReorderPolicy.reorder_point
        )
        health_items = (await db.execute(health_stmt)).scalars().all()
        print(f"Items matching Health Logic (ROP > 0): {len(health_items)}")
        
        # Checking how many have ROP == 0 and stock <= 0
        diff_stmt = select(ReorderPolicy.product_id).where(
            ReorderPolicy.reorder_point == 0,
            avail_subq <= 0
        )
        diff_items = (await db.execute(diff_stmt)).scalars().all()
        print(f"Items with ROP=0 and stock<=0: {len(diff_items)}")
        
if __name__ == "__main__":
    asyncio.run(compare_logic())
