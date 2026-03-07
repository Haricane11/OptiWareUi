import asyncio
from sqlalchemy import text
from app.core.database import async_session_factory

async def check():
    async with async_session_factory() as db:
        # Check ALL SLOW_MOVING items with NULL or low cost
        r = await db.execute(text(
            "SELECT p.id, p.name, p.unit_price, p.cost, h.classification, h.recommended_action "
            "FROM products p JOIN inventory_health_analytics h ON h.product_id = p.id "
            "WHERE h.classification = 'SLOW_MOVING' ORDER BY p.name"
        ))
        rows = r.all()
        print(f"=== ALL {len(rows)} SLOW_MOVING items ===")
        for row in rows:
            price = float(row[2]) if row[2] else 0
            cost = float(row[3]) if row[3] else 0
            margin = (price - cost) / price if price > 0 else 0
            print(f"  id={row[0]} name={row[1]} price={price:.2f} cost={cost:.2f} margin={margin:.2%} action={row[5]}")

        # Now update ALL SLOW_MOVING products to have 50% margin cost
        r2 = await db.execute(text(
            "UPDATE products SET cost = unit_price * 0.45 "
            "WHERE id IN (SELECT product_id FROM inventory_health_analytics WHERE classification = 'SLOW_MOVING')"
        ))
        await db.commit()
        print(f"\nUpdated {r2.rowcount} SLOW_MOVING products to 55% margin (cost = price * 0.45)")

asyncio.run(check())
