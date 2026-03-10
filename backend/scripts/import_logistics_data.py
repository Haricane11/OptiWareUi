import asyncio
import csv
import logging
import sys
from datetime import datetime, date
from decimal import Decimal
from typing import Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext

from app.core.database import async_session_factory
from app.models.products import Product
from app.models.warehouse import Warehouse, Floor, Area, Zone, Shelf, ShelfType
from app.models.supplier import Supplier
from app.models.customer import Customer
from app.models.user import User
from app.models.inventory import Inventory
from app.models.reorder_policy import ReorderPolicy
from app.models.demand_analytics import ProductDemandAnalytics
from app.models.logistics_metrics import ProductLogisticsMetrics

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

CSV_PATH = "../logistics_dataset.csv"

async def setup_prerequisites(db: AsyncSession) -> Dict[str, Any]:
    """Ensure basic prerequisites exist and return their IDs/instances."""
    
    # Supplier
    supplier_result = await db.execute(select(Supplier).limit(1))
    supplier = supplier_result.scalar_one_or_none()
    if not supplier:
        supplier = Supplier(
            name="Default Logistics Supplier",
            contact_person="Logistics Manager",
            email="logistics@example.com",
            allows_return=True,
            return_window_days=30
        )
        db.add(supplier)
        await db.flush()
        
    # Warehouse & Floor
    wh_result = await db.execute(select(Warehouse).limit(1))
    warehouse = wh_result.scalar_one_or_none()
    if not warehouse:
        warehouse = Warehouse(
            name="Main Logistics Center",
            location="Industrial District",
        )
        db.add(warehouse)
        await db.flush()
        
        floor = Floor(warehouse_id=warehouse.id, floor_number=1)
        db.add(floor)
        await db.flush()
    else:
        floor_result = await db.execute(select(Floor).where(Floor.warehouse_id == warehouse.id).limit(1))
        floor = floor_result.scalar_one_or_none()
        if not floor:
            floor = Floor(warehouse_id=warehouse.id, floor_number=1)
            db.add(floor)
            await db.flush()

    # User
    user_result = await db.execute(select(User).limit(1))
    user = user_result.scalar_one_or_none()
    if not user:
        # Avoid bcrypt > 72 bytes error by ensuring the source is short.
        # passlib CryptContext might have issues with certain configurations here
        hashed_pw = pwd_context.hash("admin")
        user = User(
            username="system_admin",
            password=hashed_pw,
            role="ADMIN"
        )
        db.add(user)
        await db.flush()

    # Customer
    customer_result = await db.execute(select(Customer).limit(1))
    customer = customer_result.scalar_one_or_none()
    if not customer:
        customer = Customer(
            customer_name="Default Retail Customer",
            contact_person="Store Manager",
            email="store@example.com",
            shipping_address="123 Retail Ave"
        )
        db.add(customer)
        await db.flush()

    return {
        "supplier_id": supplier.id,
        "warehouse_id": warehouse.id,
        "floor_id": floor.id,
        "user_id": user.id,
    }


async def get_or_create_zone_shelf(
    db: AsyncSession,
    zone_name: str,
    shelf_code: str,
    product_category: str,
    floor_id: int
) -> int:
    """Gets a Shelf ID, creating Zone and Shelf if needed."""
    
    # 1. Zone
    zone_result = await db.execute(
        select(Zone).where(Zone.zone_name == zone_name, Zone.floor_id == floor_id)
    )
    zone = zone_result.scalar_one_or_none()
    if not zone:
        zone = Zone(
            floor_id=floor_id,
            zone_name=zone_name,
            zone_type="STORAGE",
            product_category=product_category
        )
        db.add(zone)
        await db.flush()

    # 2. Shelf
    shelf_result = await db.execute(
        select(Shelf).where(Shelf.shelf_code == shelf_code, Shelf.zone_id == zone.id)
    )
    shelf = shelf_result.scalar_one_or_none()
    if not shelf:
        shelf = Shelf(
            zone_id=zone.id,
            shelf_code=shelf_code,
            product_category=product_category,
            max_weight=10000,
            volume=1000,
            available_volume=1000
        )
        db.add(shelf)
        await db.flush()

    return shelf.id


async def import_data():
    logger.info("Starting logistics data import...")
    
    try:
        with open(CSV_PATH, 'r') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
    except FileNotFoundError:
        logger.error(f"Could not find CSV file at {CSV_PATH}")
        sys.exit(1)
        
    logger.info(f"Loaded {len(rows)} rows from CSV.")

    async with async_session_factory() as session:
        async with session.begin():
            prereqs = await setup_prerequisites(session)
            
            # Caches to minimize DB lookups
            zone_shelf_cache: Dict[str, int] = {}  # "zone|shelf" -> shelf_id
            product_cache: Dict[str, int] = {}     # sku -> product_id
            
            for index, row in enumerate(rows):
                if index % 500 == 0 and index > 0:
                    logger.info(f"Processed {index} records...")

                sku = row["item_id"]
                category = row["category"]
                unit_price = Decimal(row["unit_price"])
                turnover_rate = Decimal(row["turnover_ratio"])
                
                # Format Dates
                try:
                    last_restock = datetime.strptime(row["last_restock_date"], "%Y-%m-%d").date()
                except ValueError:
                    last_restock = date.today()
                    
                # ── 1. Create/Get Product ────────────────────────────
                if sku in product_cache:
                    product_id = product_cache[sku]
                else:
                    result = await session.execute(select(Product).where(Product.sku == sku))
                    product = result.scalar_one_or_none()
                    if not product:
                        product = Product(
                            sku=sku,
                            name=f"Product {sku}",
                            category=category,
                            unit_price=unit_price,
                            turnover_rate=turnover_rate,
                            supplier_id=prereqs["supplier_id"],
                        )
                        session.add(product)
                        await session.flush()
                    else:
                        product.category = category
                        product.unit_price = unit_price
                        product.turnover_rate = turnover_rate
                        
                    product_id = product.id
                    product_cache[sku] = product_id

                # ── 2. Handle Localization (Zone/Shelf) ───────────────
                z_code = row["zone"]
                s_code = row["storage_location_id"]
                cache_key = f"{z_code}|{s_code}"
                
                if cache_key in zone_shelf_cache:
                    shelf_id = zone_shelf_cache[cache_key]
                else:
                    shelf_id = await get_or_create_zone_shelf(
                        session, z_code, s_code, category, prereqs["floor_id"]
                    )
                    zone_shelf_cache[cache_key] = shelf_id

                # ── 3. Inventory ───────────────────────────────────────
                stock_level = int(row["stock_level"])
                # Upsert an active inventory record for this product/shelf combo
                inv_result = await session.execute(
                    select(Inventory).where(
                        Inventory.product_id == product_id,
                        Inventory.shelf_id == shelf_id,
                        Inventory.status == "ACTIVE"
                    )
                )
                inv = inv_result.scalar_one_or_none()
                if not inv:
                    inv = Inventory(
                        product_id=product_id,
                        warehouse_id=prereqs["warehouse_id"],
                        shelf_id=shelf_id,
                        batch_number=f"BATCH-{last_restock.isoformat()}",
                        quantity=stock_level,
                        allocated=0,
                        available=stock_level,
                        received_date=last_restock
                    )
                    session.add(inv)
                else:
                    inv.quantity = stock_level
                    inv.available = stock_level - inv.allocated
                    inv.received_date = last_restock

                # ── 4. Reorder Policy & Analytics ──────────────────────
                daily_demand = Decimal(row["daily_demand"])
                std_dev = Decimal(row["demand_std_dev"])
                rop = int(row["reorder_point"])
                lt = int(row["lead_time_days"])
                freq = int(row["reorder_frequency_days"])
                holding_cost = Decimal(row["holding_cost_per_unit_day"])
                
                policy_res = await session.execute(
                    select(ReorderPolicy).where(ReorderPolicy.product_id == product_id)
                )
                policy = policy_res.scalar_one_or_none()
                if not policy:
                    policy = ReorderPolicy(
                        product_id=product_id,
                        reorder_point=rop,
                        lead_time_days=lt,
                        reorder_frequency_days=freq,
                        holding_cost=holding_cost,
                        average_daily_demand=daily_demand,
                        demand_std_dev=std_dev,
                        demand_window_days=90,
                        service_level=Decimal("1.65")
                    )
                    session.add(policy)
                else:
                    policy.reorder_point = rop
                    policy.lead_time_days = lt
                    policy.reorder_frequency_days = freq
                    policy.holding_cost = holding_cost
                    policy.average_daily_demand = daily_demand
                    policy.demand_std_dev = std_dev

                da_res = await session.execute(
                    select(ProductDemandAnalytics).where(ProductDemandAnalytics.product_id == product_id)
                )
                da = da_res.scalar_one_or_none()
                if not da:
                    da = ProductDemandAnalytics(
                        product_id=product_id,
                        average_daily_demand=daily_demand,
                        demand_std_dev=std_dev,
                        window_days=90,
                        sample_size=30
                    )
                    session.add(da)
                else:
                    da.average_daily_demand = daily_demand
                    da.demand_std_dev = std_dev

                # ── 5. Product Logistics Metrics ───────────────────────
                lm_res = await session.execute(
                    select(ProductLogisticsMetrics).where(ProductLogisticsMetrics.product_id == product_id)
                )
                lm = lm_res.scalar_one_or_none()
                if not lm:
                    lm = ProductLogisticsMetrics(
                        product_id=product_id,
                        item_popularity_score=Decimal(row["item_popularity_score"]),
                        picking_time_seconds=int(row["picking_time_seconds"]),
                        handling_cost_per_unit=Decimal(row["handling_cost_per_unit"]),
                        stockout_count_last_month=int(row["stockout_count_last_month"]),
                        order_fulfillment_rate=Decimal(row["order_fulfillment_rate"]),
                        total_orders_last_month=int(row["total_orders_last_month"]),
                        layout_efficiency_score=Decimal(row["layout_efficiency_score"]),
                        forecasted_demand_next_7d=Decimal(row["forecasted_demand_next_7d"]),
                        kpi_score=Decimal(row["KPI_score"])
                    )
                    session.add(lm)
                else:
                    lm.item_popularity_score = Decimal(row["item_popularity_score"])
                    lm.picking_time_seconds = int(row["picking_time_seconds"])
                    lm.handling_cost_per_unit = Decimal(row["handling_cost_per_unit"])
                    lm.stockout_count_last_month = int(row["stockout_count_last_month"])
                    lm.order_fulfillment_rate = Decimal(row["order_fulfillment_rate"])
                    lm.total_orders_last_month = int(row["total_orders_last_month"])
                    lm.layout_efficiency_score = Decimal(row["layout_efficiency_score"])
                    lm.forecasted_demand_next_7d = Decimal(row["forecasted_demand_next_7d"])
                    lm.kpi_score = Decimal(row["KPI_score"])
        
        logger.info("Commiting transaction...")
        
    logger.info("Import completed successfully!")

if __name__ == "__main__":
    # Workaround for Windows asyncio
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    asyncio.run(import_data())
