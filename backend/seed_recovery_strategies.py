import asyncio
import random
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.products import Product
from app.models.inventory import Inventory
from app.models.warehouse import Warehouse, Shelf
from app.models.orders import SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem
from app.models.customer import Customer
from app.models.reorder_policy import ReorderPolicy
from app.services.inventory_classification_service import InventoryClassificationService

NUM_HEALTHY = 12
NUM_SLOW = 12
NUM_DORMANT_DISCOUNT = 10
NUM_DORMANT_HEAVY = 10
NUM_DEAD = 10

async def get_or_create_warehouse(db: AsyncSession):
    stmt = select(Warehouse).limit(1)
    warehouse = (await db.execute(stmt)).scalar_one_or_none()
    if not warehouse:
        warehouse = Warehouse(name="Main Warehouse", location="Mock City")
        db.add(warehouse)
        await db.flush()
    return warehouse

async def get_or_create_shelf(db: AsyncSession, warehouse_id: int):
    from app.models.warehouse import Floor, Zone
    
    # 1. Floor
    stmt = select(Floor).where(Floor.warehouse_id == warehouse_id).limit(1)
    floor = (await db.execute(stmt)).scalar_one_or_none()
    if not floor:
        floor = Floor(warehouse_id=warehouse_id, floor_number=1)
        db.add(floor)
        await db.flush()
        
    # 2. Zone
    stmt = select(Zone).where(Zone.floor_id == floor.id).limit(1)
    zone = (await db.execute(stmt)).scalar_one_or_none()
    if not zone:
        zone = Zone(floor_id=floor.id, zone_code="Z-A1", zone_type="STORAGE", product_category="ALL")
        db.add(zone)
        await db.flush()
        
    # 3. Shelf
    stmt = select(Shelf).where(Shelf.zone_id == zone.id).limit(1)
    shelf = (await db.execute(stmt)).scalar_one_or_none()
    if not shelf:
        shelf = Shelf(zone_id=zone.id, shelf_code="SH-A1")
        db.add(shelf)
        await db.flush()
        
    return shelf

async def get_or_create_customer(db: AsyncSession):
    from sqlalchemy import select
    stmt = select(Customer).limit(1)
    customer = (await db.execute(stmt)).scalar_one_or_none()
    if not customer:
        customer = Customer(name="Mock Recovery Customer", email="mock@recovery.com")
        db.add(customer)
        await db.flush()
    return customer

async def seed_product(db, idx, prefix, margin_target):
    unit_cost = random.uniform(10.0, 50.0)
    selling_price = unit_cost / (1 - margin_target)
    
    product = Product(
        name=f"{prefix} Mock Product {idx}",
        sku=f"MOCK-{prefix.upper()}-{idx}-{random.randint(1000,9999)}",
        unit_price=max(Decimal(str(round(selling_price, 2))), Decimal('0.01')),
        cost=max(Decimal(str(round(unit_cost, 2))), Decimal('0.01')),
        status="ACTIVE"
    )
    db.add(product)
    await db.flush()
    
    # Needs a reorder policy for some API outputs
    rp = ReorderPolicy(
        product_id=product.id,
        reorder_point=random.randint(5, 50),
        eoq=random.randint(20, 100),
        lead_time_days=random.randint(3, 14)
    )
    db.add(rp)
    await db.flush()
    return product

async def apply_demand_and_inventory(db, product, warehouse_id, shelf_id, customer_id, demand_type):
    today = datetime.now(timezone.utc)
    
    if demand_type == "HEALTHY":
        current_stock = random.randint(100, 200)
        num_sales_events = random.randint(10, 20)
        qty_per_sale = random.randint(2, 5)
        sales_days_ago = [random.randint(1, 85) for _ in range(num_sales_events)]
    elif demand_type == "SLOW":
        current_stock = random.randint(50, 100)
        num_sales_events = random.randint(4, 7)
        qty_per_sale = 2
        sales_days_ago = [random.randint(10, 85) for _ in range(num_sales_events)]
    elif demand_type == "DORMANT_DISCOUNT":
        current_stock = random.randint(30, 50)
        num_sales_events = random.randint(1, 2)
        qty_per_sale = 1
        sales_days_ago = [random.randint(40, 85) for _ in range(num_sales_events)]
    elif demand_type == "DORMANT_HEAVY":
        current_stock = random.randint(300, 500)
        num_sales_events = random.randint(1, 2)
        qty_per_sale = 1
        sales_days_ago = [random.randint(40, 85) for _ in range(num_sales_events)]
    elif demand_type == "DEAD":
        current_stock = random.randint(20, 50)
        num_sales_events = random.randint(1, 2)
        qty_per_sale = 5
        sales_days_ago = [random.randint(130, 180) for _ in range(num_sales_events)]
    elif demand_type == "VOLATILE":
        current_stock = random.randint(100, 150)
        num_sales_events = 1
        qty_per_sale = 80
        sales_days_ago = [80]
    else:
        current_stock = 10
        num_sales_events = 0
        qty_per_sale = 0
        sales_days_ago = []

    inv = Inventory(
        product_id=product.id,
        warehouse_id=warehouse_id,
        shelf_id=shelf_id,
        quantity=current_stock,
        available=current_stock,
        status="ACTIVE",
        received_date=today - timedelta(days=200),
        batch_number=f"BATCH-{product.sku}"
    )
    db.add(inv)
    await db.flush()

    for i, days_ago in enumerate(sales_days_ago):
        sale_date = today - timedelta(days=days_ago)
        
        so = SalesOrder(
            order_number=f"SO-MOCK-{product.id}-{i}-{random.randint(100,999)}",
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            status="DELIVERED",
            created_at=sale_date
        )
        db.add(so)
        await db.flush()
        
        soi = SalesOrderItem(
            sales_order_id=so.id,
            product_id=product.id,
            ordered_qty=qty_per_sale,
            picked_qty=qty_per_sale
        )
        db.add(soi)
        await db.flush()
        
        dn = DeliveryNote(
            delivery_number=f"DN-MOCK-{product.id}-{i}-{random.randint(100,999)}",
            sales_order_id=so.id,
            status="DELIVERED",
            created_at=sale_date,
            shipped_at=sale_date
        )
        db.add(dn)
        await db.flush()
        
        dni = DeliveryNoteItem(
            delivery_note_id=dn.id,
            sales_order_item_id=soi.id,
            shipped_qty=qty_per_sale
        )
        db.add(dni)
        await db.flush()


async def seed_data():
    async with async_session_factory() as db:
        print("Ensuring Table schema updates (adding cost column)...")
        try:
            await db.execute(text("ALTER TABLE products ADD COLUMN cost NUMERIC(10, 2)"))
            await db.commit()
        except Exception as e:
            await db.rollback()
            
        print("Ensuring PostgreSQL Enums are up to date...")
        try:
            await db.execute(text("ALTER TYPE recommended_action_enum ADD VALUE IF NOT EXISTS 'HEAVY_DISCOUNT'"))
            await db.commit()
        except Exception:
            await db.rollback()
            
        try:
            await db.execute(text("ALTER TYPE health_classification_enum ADD VALUE IF NOT EXISTS 'DORMANT'"))
            await db.commit()
        except Exception:
            await db.rollback()
            
        try:
            await db.execute(text("ALTER TYPE healthtype ADD VALUE IF NOT EXISTS 'DORMANT'"))
            await db.commit()
        except Exception:
            await db.rollback()
            
        try:
            await db.execute(text("ALTER TYPE suggestiontype ADD VALUE IF NOT EXISTS 'HEAVY_DISCOUNT'"))
            await db.commit()
        except Exception:
            await db.rollback()
            
        print("Ensuring Warehouse, Shelf, and Customer...")
        warehouse = await get_or_create_warehouse(db)
        shelf = await get_or_create_shelf(db, warehouse.id)
        customer = await get_or_create_customer(db)
        
        configs = []
        for i in range(NUM_HEALTHY):
            configs.append(("Healthy", 0.30, "HEALTHY"))
        for i in range(NUM_SLOW):
            configs.append(("Slow", 0.45, "SLOW"))
        for i in range(NUM_DORMANT_DISCOUNT):
            configs.append(("Dormant-Disc", 0.30, "DORMANT_DISCOUNT"))
        for i in range(NUM_DORMANT_HEAVY):
            configs.append(("Dormant-Heavy", 0.30, "DORMANT_HEAVY"))
        for i in range(NUM_DEAD):
            configs.append(("Dead", 0.10, "DEAD"))
        
        configs.append(("Volatile", 0.30, "VOLATILE"))
        configs.append(("Volatile", 0.30, "VOLATILE"))

        print(f"Seeding {len(configs)} products...")
        all_product_ids = []
        for idx, (prefix, margin, demand_type) in enumerate(configs, 1):
            product = await seed_product(db, idx, prefix, margin)
            await apply_demand_and_inventory(db, product, warehouse.id, shelf.id, customer.id, demand_type)
            all_product_ids.append(product.id)
            print(f"  Created {product.sku} ({demand_type})")

        await db.commit()
        print("Data mock complete. Computing Inventory Health...")
        
        # Calculate health explicitly 2 times to trigger Hysteresis threshold! 
        for _ in range(2):
            for pid in all_product_ids:
                await InventoryClassificationService.compute_inventory_health(db, pid)
            await db.commit()
            
        print("Health Classification mapped to backend successfully.")

if __name__ == "__main__":
    asyncio.run(seed_data())
