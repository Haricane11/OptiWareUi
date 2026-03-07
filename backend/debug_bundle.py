import asyncio
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.inventory_health_analytics import InventoryHealthAnalytics
from app.models.products import Product

async def check():
    async with async_session_factory() as db:
        # Check SLOW_MOVING items
        stmt = (
            select(
                InventoryHealthAnalytics.product_id,
                InventoryHealthAnalytics.classification,
                InventoryHealthAnalytics.recommended_action,
                Product.unit_price,
                Product.cost,
                Product.name
            )
            .join(Product, Product.id == InventoryHealthAnalytics.product_id)
            .where(InventoryHealthAnalytics.classification == "SLOW_MOVING")
            .limit(20)
        )
        rows = (await db.execute(stmt)).all()
        print(f"=== SLOW_MOVING items: {len(rows)} ===")
        for r in rows:
            price = float(r.unit_price) if r.unit_price else 0
            cost = float(r.cost) if r.cost else 0
            margin = (price - cost) / price if price > 0 else 0
            action = r.recommended_action.value if hasattr(r.recommended_action, 'value') else str(r.recommended_action)
            cls = r.classification.value if hasattr(r.classification, 'value') else str(r.classification)
            print(f"  {r.name}: class={cls} action={action} price={price:.2f} cost={cost:.2f} margin={margin:.2%}")

        # Check all unique actions
        stmt2 = select(
            InventoryHealthAnalytics.recommended_action,
            InventoryHealthAnalytics.classification
        )
        rows2 = (await db.execute(stmt2)).all()
        actions = {}
        for r in rows2:
            a = r.recommended_action.value if hasattr(r.recommended_action, 'value') else str(r.recommended_action)
            actions[a] = actions.get(a, 0) + 1
        print(f"\n=== Action distribution ===")
        for a, c in sorted(actions.items()):
            print(f"  {a}: {c}")

asyncio.run(check())
