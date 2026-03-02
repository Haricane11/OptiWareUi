"""Strip the '#N' suffixes from product names (e.g. 'Premium Coffee Beans #16' → 'Premium Coffee Beans')."""
import asyncio, re
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.products import Product
from app.models.bundle import Bundle, BundleItem

async def fix():
    async with async_session_factory() as db:
        # Fix product names
        result = await db.execute(select(Product).where(Product.name.op("~")(" #[0-9]+")))
        products = result.scalars().all()
        if not products:
            # Try LIKE pattern for SQLite
            result = await db.execute(select(Product))
            products = [p for p in result.scalars().all() if re.search(r" #\d+$", p.name)]

        print(f"Found {len(products)} products with '#N' suffixes.")
        for p in products:
            p.name = re.sub(r" #\d+$", "", p.name)
        await db.commit()
        print("Product names cleaned.")

        # Fix bundle names
        result = await db.execute(select(Bundle))
        bundles = result.scalars().all()
        count = 0
        for b in bundles:
            new_name = re.sub(r" #\d+", "", b.bundle_name)
            if new_name != b.bundle_name:
                b.bundle_name = new_name
                count += 1
        await db.commit()
        print(f"Cleaned {count} bundle names. Done!")

if __name__ == "__main__":
    asyncio.run(fix())
