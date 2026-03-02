"""Seed script: add 20 products with low stock to test reorder features."""
import asyncio
import random
from decimal import Decimal

from app.core.database import engine, async_session_factory
from app.models.products import Product
from app.models.reorder_policy import ReorderPolicy
from app.models.inventory import Inventory
from app.models.supplier import Supplier

from sqlalchemy import select

ITEMS = [
    ("Organic Green Tea 500g", "FOOD", "AMBIENT"),
    ("USB-C Hub 7-Port", "ELECTRONICS", "STANDARD"),
    ("LED Desk Lamp Pro", "ELECTRONICS", "FRAGILE"),
    ("Stainless Water Bottle 1L", "KITCHEN", "STANDARD"),
    ("Wireless Earbuds V3", "ELECTRONICS", "FRAGILE"),
    ("Bamboo Cutting Board", "KITCHEN", "STANDARD"),
    ("Smart Thermostat Wi-Fi", "ELECTRONICS", "FRAGILE"),
    ("Cotton Bath Towel Set", "HOME", "STANDARD"),
    ("Protein Bar Variety 24pk", "FOOD", "AMBIENT"),
    ("Yoga Mat Premium 6mm", "FITNESS", "STANDARD"),
    ("Ceramic Coffee Mug Set 4", "KITCHEN", "FRAGILE"),
    ("Bluetooth Speaker Mini", "ELECTRONICS", "FRAGILE"),
    ("Stainless Kitchen Knife Set", "KITCHEN", "STANDARD"),
    ("Aloe Vera Gel 250ml", "BEAUTY", "AMBIENT"),
    ("Portable Power Bank 20000mAh", "ELECTRONICS", "STANDARD"),
    ("Organic Honey 500ml", "FOOD", "AMBIENT"),
    ("Gaming Mouse Pad XL", "ELECTRONICS", "STANDARD"),
    ("Essential Oil Diffuser", "HOME", "FRAGILE"),
    ("Recycled Notebook A5 3pk", "OFFICE", "STANDARD"),
    ("Vitamin C Tablets 120ct", "HEALTH", "AMBIENT"),
]


async def main():
    async with async_session_factory() as session:
        # Pick a random existing supplier
        result = await session.execute(select(Supplier).limit(1))
        supplier = result.scalars().first()
        supplier_id = supplier.id if supplier else None

        # Find the max warehouse_id used in inventory
        result = await session.execute(select(Inventory.warehouse_id).limit(1))
        row = result.scalars().first()
        warehouse_id = row if row else 1

        created = 0
        for i, (name, category, handling) in enumerate(ITEMS):
            sku = f"REORD{i+1:03d}"
            
            # Check if already exists
            existing = await session.execute(select(Product).where(Product.sku == sku))
            if existing.scalars().first():
                continue

            unit_price = Decimal(str(round(random.uniform(5.0, 120.0), 2)))
            
            product = Product(
                sku=sku,
                name=name,
                category=category,
                supplier_id=supplier_id,
                handling_type=handling,
                unit_price=unit_price,
                status="ACTIVE",
            )
            session.add(product)
            await session.flush()  # get product.id

            # Create reorder policy: ROP between 50-200, EOQ 100-500
            rop = random.randint(50, 200)
            eoq = random.randint(100, 500)
            safety = random.randint(10, 50)
            lead_time = random.randint(3, 14)

            policy = ReorderPolicy(
                product_id=product.id,
                reorder_point=rop,
                safety_stock=safety,
                eoq=eoq,
                lead_time_days=lead_time,
                reorder_frequency_days=30,
                ordering_cost=Decimal("25.00"),
                holding_cost=Decimal("2.50"),
            )
            session.add(policy)

            # Create inventory with LOW stock (below ROP)
            low_qty = random.randint(1, max(1, rop // 3))
            inv = Inventory(
                product_id=product.id,
                warehouse_id=warehouse_id,
                quantity=low_qty,
                available=low_qty,
                status="ACTIVE",
            )
            session.add(inv)
            created += 1
            print(f"  [{created}] {name} (SKU: {sku}) stock={low_qty}, ROP={rop}, EOQ={eoq}")

        await session.commit()
        print(f"\nDone: {created} products seeded for reorder testing.")


if __name__ == "__main__":
    asyncio.run(main())
