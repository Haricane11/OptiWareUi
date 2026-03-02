"""
Seed data for the WMS backend — uses async sessions for the new architecture.

Run: python -m seed_data
"""

import asyncio
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.core.database import engine, Base, async_session_factory
from app.models import (
    Warehouse, Floor, Zone, Shelf,
    Supplier, Customer,
    Product, ReorderPolicy, Inventory,
    PurchaseOrder, PurchaseOrderItem,
    Receipt, ReceiptItem,
    SalesOrder, SalesOrderItem,
)


async def seed():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as db:
        async with db.begin():
            # Check if data exists
            from sqlalchemy import select, func
            count = (await db.execute(select(func.count()).select_from(Product))).scalar()
            if count > 0:
                print("Data already exists. Skipping seed.")
                return

            print("Seeding data...")

            # ── Warehouse hierarchy ───────────────────────────────────
            wh = Warehouse(name="Main Warehouse", location="Building A", status="ACTIVE")
            db.add(wh)
            await db.flush()

            floor1 = Floor(warehouse_id=wh.id, floor_number=1)
            db.add(floor1)
            await db.flush()

            zone1 = Zone(floor_id=floor1.id, zone_code="Z-A1", zone_type="AMBIENT", width=50, depth=30)
            zone2 = Zone(floor_id=floor1.id, zone_code="Z-C1", zone_type="CHILLED", width=20, depth=15)
            db.add_all([zone1, zone2])
            await db.flush()

            s1 = Shelf(
                zone_id=zone1.id, shelf_code="S-A1-01", aisle_num=1, bay_num=1, level_num=1,
                width=2, depth=1, height=2, volume=4, max_weight=500,
                current_weight=0, used_volume=0, available_volume=4,
                temperature_zone="AMBIENT", can_store_hazardous=False,
                status="ACTIVE", product_category="Electronics",
            )
            s2 = Shelf(
                zone_id=zone1.id, shelf_code="S-A1-02", aisle_num=1, bay_num=2, level_num=1,
                width=2, depth=1, height=2, volume=4, max_weight=500,
                current_weight=0, used_volume=0, available_volume=4,
                temperature_zone="AMBIENT", can_store_hazardous=True,
                status="ACTIVE",
            )
            s3 = Shelf(
                zone_id=zone2.id, shelf_code="S-C1-01", aisle_num=1, bay_num=1, level_num=1,
                width=2, depth=1, height=2, volume=4, max_weight=300,
                current_weight=0, used_volume=0, available_volume=4,
                temperature_zone="CHILLED", can_store_hazardous=False,
                status="ACTIVE", product_category="Groceries",
            )
            db.add_all([s1, s2, s3])
            await db.flush()

            # ── Supplier ──────────────────────────────────────────────
            sup = Supplier(name="TechSupply Co", phone="555-0100", contact_person="John", email="john@techsupply.com")
            db.add(sup)
            await db.flush()

            # ── Customer ──────────────────────────────────────────────
            cust = Customer(customer_name="Retail Corp", contact_person="Jane", email="jane@retail.com", phone="555-0200", shipping_address="123 Commerce St")
            db.add(cust)
            await db.flush()

            # ── Products ──────────────────────────────────────────────
            p1 = Product(sku="PHONE-001", name="Smartphone", category="Electronics", supplier_id=sup.id, unit_price=500, weight=0.2, volume=0.001, storage_temperature="AMBIENT")
            p2 = Product(sku="MILK-001", name="Milk", category="Groceries", supplier_id=sup.id, unit_price=2.50, weight=1.0, volume=0.001, storage_temperature="CHILLED")
            p3 = Product(sku="KEYB-001", name="Old Keyboard", category="Electronics", supplier_id=sup.id, unit_price=20, weight=0.5, volume=0.002, storage_temperature="AMBIENT")
            p4 = Product(sku="WATCH-001", name="Luxury Watch", category="Accessories", supplier_id=sup.id, unit_price=1000, weight=0.1, volume=0.0005, storage_temperature="AMBIENT")
            db.add_all([p1, p2, p3, p4])
            await db.flush()

            # ── Reorder Policies ──────────────────────────────────────
            rp1 = ReorderPolicy(product_id=p1.id, reorder_point=20, safety_stock=10, eoq=50)
            rp2 = ReorderPolicy(product_id=p2.id, reorder_point=50, safety_stock=20, eoq=100)
            db.add_all([rp1, rp2])

            # ── Inventory batches ─────────────────────────────────────
            today = date.today()
            inv1 = Inventory(
                product_id=p1.id, shelf_id=s1.id, warehouse_id=wh.id,
                batch_number="BATCH-001", quantity=50, allocated=0, available=50,
                total_weight=10, total_volume=0.05, received_date=today - timedelta(days=10),
                status="ACTIVE",
            )
            inv2 = Inventory(
                product_id=p2.id, shelf_id=s3.id, warehouse_id=wh.id,
                batch_number="BATCH-002", quantity=50, allocated=0, available=50,
                total_weight=50, total_volume=0.05,
                expiry_date=today + timedelta(days=3), received_date=today - timedelta(days=7),
                status="ACTIVE",
            )
            inv3 = Inventory(
                product_id=p2.id, shelf_id=s3.id, warehouse_id=wh.id,
                batch_number="BATCH-003", quantity=50, allocated=0, available=50,
                total_weight=50, total_volume=0.05,
                expiry_date=today + timedelta(days=30), received_date=today - timedelta(days=1),
                status="ACTIVE",
            )
            inv4 = Inventory(
                product_id=p3.id, shelf_id=s1.id, warehouse_id=wh.id,
                batch_number="BATCH-004", quantity=20, allocated=0, available=20,
                total_weight=10, total_volume=0.04, received_date=today - timedelta(days=120),
                status="ACTIVE",
            )
            inv5 = Inventory(
                product_id=p4.id, shelf_id=s1.id, warehouse_id=wh.id,
                batch_number="BATCH-005", quantity=5, allocated=0, available=5,
                total_weight=0.5, total_volume=0.0025, received_date=today - timedelta(days=5),
                status="ACTIVE",
            )
            db.add_all([inv1, inv2, inv3, inv4, inv5])

            # ── Sales orders ──────────────────────────────────────────
            so = SalesOrder(
                order_number="SO-001", customer_id=cust.id, warehouse_id=wh.id,
                status="CREATED", order_date=today,
            )
            db.add(so)
            await db.flush()

            db.add(SalesOrderItem(sales_order_id=so.id, product_id=p1.id, ordered_qty=5, picked_qty=0))
            await db.flush()

        print("Seeding complete!")


if __name__ == "__main__":
    asyncio.run(seed())
