import asyncio
from sqlalchemy import select, func
from app.core.database import SessionLocal
from app.models.products import Product
from app.models.reorder_policy import ReorderPolicy
from app.models.inventory import Inventory
from app.models.inventory_health import InventoryHealthStatus

async def main():
    async with SessionLocal() as db:
        # Reorder Logic
        avail_subq = (
            func.coalesce(
                select(func.sum(Inventory.available))
                .where(
                    Inventory.product_id == ReorderPolicy.product_id,
                    Inventory.status == 'ACTIVE',
                )
                .correlate(ReorderPolicy)
                .scalar_subquery(),
                0,
            )
        )
        stmt_reorder = (
            select(ReorderPolicy.product_id)
            .where(
                ReorderPolicy.reorder_point.isnot(None),
                avail_subq <= ReorderPolicy.reorder_point
            )
        )
        res_reorder = await db.execute(stmt_reorder)
        reorders = {r[0] for r in res_reorder.all()}

        # Health Logic
        stmt_health = select(InventoryHealthStatus.product_id).where(InventoryHealthStatus.health_type == 'LOW')
        res_health = await db.execute(stmt_health)
        healths = {r[0] for r in res_health.all()}

        print(f"Items in Reorder Logic: {len(reorders)}")
        print(f"Items in Health Status 'LOW': {len(healths)}")

        diff = reorders - healths
        print(f"Missing from Health Report: {len(diff)}")
        print("Missing IDs:", diff)

asyncio.run(main())
