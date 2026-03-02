"""
Update generic product names (e.g. "Product ITM12704") to realistic warehouse product names.
Also updates the corresponding bundle_name fields.

Run:  python update_product_names.py
"""

import asyncio
import random
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, async_session_factory
from app.models.products import Product
from app.models.bundle import Bundle, BundleItem

# ── Realistic product name pools by category ──────────────────────────
PRODUCT_NAMES = {
    "Electronics": [
        "Wireless Bluetooth Speaker", "USB-C Charging Cable", "LED Desk Lamp",
        "Portable Power Bank", "Noise-Canceling Headphones", "Smart Watch Band",
        "Webcam HD 1080p", "Mechanical Keyboard", "Wireless Mouse", "HDMI Adapter",
        "Laptop Stand", "Screen Protector X", "Tablet Stylus Pen", "Car Phone Mount",
        "Digital Alarm Clock", "USB Flash Drive 64GB", "Ethernet Cable 3m",
        "Portable SSD 500GB", "Gaming Mouse Pad", "Smart Plug WiFi",
        "Wireless Earbuds Pro", "Mini Projector", "Ring Light 10inch",
        "Surge Protector Strip", "Smart Home Hub",
    ],
    "Groceries": [
        "Organic Whole Milk", "Greek Yogurt 500g", "Fresh Orange Juice 1L",
        "Sourdough Bread Loaf", "Free-Range Eggs 12pk", "Cheddar Cheese Block",
        "Olive Oil Extra Virgin", "Basmati Rice 2kg", "Pasta Penne 500g",
        "Canned Tomatoes 400g", "Honey Raw 350g", "Peanut Butter Smooth",
        "Dark Chocolate 85%", "Green Tea Bags 50pk", "Almond Milk 1L",
        "Granola Cereal 750g", "Frozen Mixed Berries", "Coconut Water 330ml",
        "Sparkling Water 6pk", "Oat Milk Barista",
        "Fresh Yogurt Pack", "Organic Baby Spinach", "Artisan Sourdough",
        "Premium Coffee Beans", "Whey Protein Powder",
    ],
    "Accessories": [
        "Leather Wallet Slim", "Aviator Sunglasses", "Canvas Tote Bag",
        "Stainless Steel Water Bottle", "Silk Neck Tie", "Leather Belt Classic",
        "Travel Luggage Tag Set", "Umbrella Compact Auto", "Wool Beanie Hat",
        "Crossbody Messenger Bag", "Wrist Watch Classic", "Hair Styling Comb",
        "Keychain Multi-Tool", "Reading Glasses +2.0", "Phone Case Rugged",
        "Laptop Sleeve 14inch", "Fitness Tracker Band", "Passport Holder Leather",
        "Polarized Clip-On Lenses", "Drawstring Backpack",
        "Cotton Bandana Set", "Charm Bracelet Silver", "Cufflinks Stainless",
        "Magnetic Money Clip", "Travel Pillow Memory Foam",
    ],
    "Home & Kitchen": [
        "Stainless Mixing Bowl Set", "Non-Stick Frying Pan 28cm", "Bamboo Cutting Board",
        "Silicone Spatula Set", "Glass Food Containers 5pk", "French Press Coffee Maker",
        "Ceramic Dinner Plates 4pk", "Stainless Cutlery Set", "Kitchen Timer Digital",
        "Oven Mitts Heat-Resistant", "Dish Drying Rack", "Spice Jar Set 12pk",
        "Tea Kettle Whistling", "Ice Cube Tray Silicone", "Reusable Beeswax Wraps",
    ],
    "Health & Beauty": [
        "Vitamin C Serum 30ml", "Moisturizer SPF 30", "Hand Sanitizer 500ml",
        "Lip Balm Organic 3pk", "Shampoo Argan Oil", "Conditioner Keratin",
        "Face Mask Sheet 10pk", "Sunscreen SPF 50+", "Body Lotion Aloe Vera",
        "Dental Floss Mint 50m", "Cotton Rounds 100pk", "Hair Brush Detangling",
        "Nail Clipper Set", "Deodorant Roll-On", "Bath Bomb Gift Set",
    ],
    "Office Supplies": [
        "Sticky Notes Neon 500pk", "Ballpoint Pen Set 12pk", "A4 Copy Paper 500sh",
        "Binder Clips Assorted", "Highlighter Set 6pk", "Desk Organizer Mesh",
        "Correction Tape 5pk", "Stapler Heavy Duty", "Paper Shredder", "Whiteboard Markers 8pk",
        "File Folders 25pk", "Laminating Pouches A4", "Tape Dispenser Desktop",
        "Calculator Scientific", "Notebook Spiral A5",
    ],
    "Clothing": [
        "Cotton T-Shirt White L", "Denim Jeans Slim 32", "Hoodie Pullover Grey",
        "Running Shoes Size 10", "Wool Socks 5pk", "Rain Jacket Waterproof",
        "Polo Shirt Navy M", "Jogger Pants Black L", "Baseball Cap Adjustable",
        "Thermal Underwear Set", "Linen Shirt Blue S", "Cargo Shorts Khaki",
        "Sneakers Canvas White", "Fleece Vest Zip-Up", "Dress Socks 3pk",
    ],
    None: [  # Fallback for products without a category
        "General Purpose Item", "Standard Supply Pack", "Utility Kit Basic",
        "Multi-Use Container", "Storage Box Medium", "Heavy Duty Tape Roll",
        "Cleaning Spray 750ml", "Safety Gloves Pair", "Dust Mask 10pk",
        "Cable Ties 100pk", "Bubble Wrap Roll 10m", "Packing Peanuts Bag",
        "Stretch Film Roll", "Label Maker Tape", "Marker Pen Permanent",
    ],
}

# Flatten all names for fallback use
ALL_NAMES = []
for names in PRODUCT_NAMES.values():
    ALL_NAMES.extend(names)


async def update_names():
    async with async_session_factory() as db:
        # Get all products with generic names
        stmt = select(Product).where(Product.name.like("Product ITM%"))
        result = await db.execute(stmt)
        products = result.scalars().all()

        if not products:
            print("No products with generic names found. Nothing to update.")
            return

        print(f"Found {len(products)} products with generic names. Updating...")

        # Track used names to avoid duplicates
        used_names = set()
        name_counter = {}

        for prod in products:
            category = prod.category
            pool = PRODUCT_NAMES.get(category, PRODUCT_NAMES[None])

            # Pick a name from the pool, adding a variant suffix if needed
            base_name = random.choice(pool)
            name = base_name

            # If name already used, add a variant number
            if name in used_names:
                name_counter[base_name] = name_counter.get(base_name, 1) + 1
                name = f"{base_name} #{name_counter[base_name]}"

            used_names.add(name)
            prod.name = name

        await db.commit()
        print(f"Updated {len(products)} product names.")

        # Now update bundle names to reflect the new product names
        print("Updating bundle names...")
        bundle_stmt = select(Bundle)
        bundle_result = await db.execute(bundle_stmt)
        all_bundles = bundle_result.scalars().all()

        updated_count = 0
        for bundle in all_bundles:
            if not bundle.bundle_name.startswith("Bundle:"):
                continue

            # Load bundle items with products
            items_stmt = (
                select(BundleItem)
                .where(BundleItem.bundle_id == bundle.id)
            )
            items_result = await db.execute(items_stmt)
            items = items_result.scalars().all()

            if items:
                # Get product names for each item
                product_names = []
                for item in items:
                    prod_stmt = select(Product).where(Product.id == item.product_id)
                    prod_result = await db.execute(prod_stmt)
                    prod = prod_result.scalar_one_or_none()
                    if prod:
                        product_names.append(prod.name)

                if product_names:
                    bundle.bundle_name = "Bundle: " + " + ".join(product_names)
                    updated_count += 1

        await db.commit()
        print(f"Updated {updated_count} bundle names.")
        print("Done!")


if __name__ == "__main__":
    asyncio.run(update_names())
