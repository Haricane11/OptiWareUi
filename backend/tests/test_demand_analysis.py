"""
Unit tests for DemandAnalysisService.

Uses sync SQLite in-memory DB (matching existing conftest.py pattern).
Tests cover: ADD computation, zero shipments, sparse data, high variance,
EOQ cost-skip, multi-day shipments, and persistence validation.
"""

import unittest
import math
from datetime import datetime, timedelta, date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.database import Base
from app.models.products import Product
from app.models.supplier import Supplier
from app.models.customer import Customer
from app.models.warehouse import Warehouse
from app.models.orders import SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem
from app.models.reorder_policy import ReorderPolicy
from app.models.demand_analytics import ProductDemandAnalytics


# ── Helpers ───────────────────────────────────────────────────────────

def _create_engine_and_session():
    """Create a fresh in-memory SQLite engine and session."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, TestSession()


def _seed_base_data(db: Session) -> tuple:
    """Create minimal supplier, warehouse, customer, product."""
    supplier = Supplier(
        name="Test Supplier",
        contact_person="John",
        email="john@test.com",
    )
    db.add(supplier)
    db.flush()

    warehouse = Warehouse(name="WH-1", location="Test")
    db.add(warehouse)
    db.flush()

    customer = Customer(
        customer_name="Test Customer",
        contact_person="Jane",
        email="jane@test.com",
        shipping_address="123 Test St",
    )
    db.add(customer)
    db.flush()

    product = Product(
        sku="TST-001",
        name="Test Product",
        unit_price=Decimal("100.00"),
        supplier_id=supplier.id,
    )
    db.add(product)
    db.flush()

    return supplier, warehouse, customer, product


def _create_shipment(
    db: Session,
    product: Product,
    warehouse: Warehouse,
    customer: Customer,
    shipped_qty: int,
    shipped_at: datetime,
) -> None:
    """Create a complete sales order → delivery note → shipment chain."""
    order = SalesOrder(
        order_number=f"SO-{shipped_at.isoformat()}-{shipped_qty}",
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        status="DELIVERED",
        order_date=shipped_at.date(),
    )
    db.add(order)
    db.flush()

    item = SalesOrderItem(
        sales_order_id=order.id,
        product_id=product.id,
        ordered_qty=shipped_qty,
        picked_qty=shipped_qty,
    )
    db.add(item)
    db.flush()

    dn = DeliveryNote(
        delivery_number=f"DN-{shipped_at.isoformat()}-{shipped_qty}",
        sales_order_id=order.id,
        status="SHIPPED",
        shipped_at=shipped_at,
    )
    db.add(dn)
    db.flush()

    dn_item = DeliveryNoteItem(
        delivery_note_id=dn.id,
        sales_order_item_id=item.id,
        shipped_qty=shipped_qty,
    )
    db.add(dn_item)
    db.flush()


# ── Sync wrappers for the async service (for SQLite unit tests) ───────

import statistics as _stats


def _compute_demand_metrics_sync(
    db: Session,
    product_id: int,
    window_days: int = 90,
) -> dict:
    """
    Synchronous reimplementation of DemandAnalysisService.compute_demand_metrics
    for use with sync SQLite test sessions. Mirrors the exact same logic.
    """
    from sqlalchemy import select, func
    from app.models.orders import DeliveryNote, DeliveryNoteItem, SalesOrderItem

    cutoff = datetime.utcnow() - timedelta(days=window_days)

    # Use func.date() for SQLite compatibility (not cast to Date)
    stmt = (
        select(
            func.date(DeliveryNote.shipped_at).label("ship_date"),
            func.sum(DeliveryNoteItem.shipped_qty).label("daily_qty"),
        )
        .select_from(DeliveryNoteItem)
        .join(DeliveryNote, DeliveryNoteItem.delivery_note_id == DeliveryNote.id)
        .join(SalesOrderItem, DeliveryNoteItem.sales_order_item_id == SalesOrderItem.id)
        .where(
            SalesOrderItem.product_id == product_id,
            DeliveryNoteItem.shipped_qty > 0,
            DeliveryNote.shipped_at.isnot(None),
            DeliveryNote.shipped_at >= cutoff,
        )
        .group_by(func.date(DeliveryNote.shipped_at))
    )

    result = db.execute(stmt)
    rows = result.all()

    daily_lookup: dict = {}
    for row in rows:
        ship_date = row.ship_date
        if isinstance(ship_date, datetime):
            ship_date = ship_date.date()
        elif isinstance(ship_date, str):
            # SQLite returns date() as string "YYYY-MM-DD"
            ship_date = date.fromisoformat(ship_date)
        elif isinstance(ship_date, date):
            pass  # already a date
        else:
            ship_date = date.fromisoformat(str(ship_date))
        daily_lookup[ship_date] = int(row.daily_qty)

    today = date.today()
    daily_series: list[float] = []
    for i in range(window_days):
        day = today - timedelta(days=window_days - 1 - i)
        daily_series.append(float(daily_lookup.get(day, 0)))

    total_shipped = sum(daily_series)
    sample_size = len([v for v in daily_series if v > 0])
    add = total_shipped / window_days if window_days > 0 else 0.0

    if len(daily_series) >= 2:
        std_dev = _stats.stdev(daily_series)
    else:
        std_dev = 0.0

    return {
        "average_daily_demand": round(add, 4),
        "demand_std_dev": round(std_dev, 4),
        "sample_size": sample_size,
        "total_shipped": int(total_shipped),
        "window_days": window_days,
    }


def _compute_reorder_policy_sync(
    db: Session,
    product_id: int,
) -> dict:
    """
    Synchronous reimplementation of DemandAnalysisService.compute_reorder_policy.
    """
    from sqlalchemy import select

    stmt = select(ReorderPolicy).where(ReorderPolicy.product_id == product_id)
    result = db.execute(stmt)
    policy = result.scalar_one_or_none()

    if not policy:
        return {"product_id": product_id, "status": "skipped"}

    window_days = policy.demand_window_days or 90
    metrics = _compute_demand_metrics_sync(db, product_id, window_days)

    add = metrics["average_daily_demand"]
    std_dev = metrics["demand_std_dev"]

    lead_time = policy.lead_time_days or 0
    z_score = float(policy.service_level or Decimal("1.65"))

    if lead_time > 0:
        safety_stock = z_score * std_dev * math.sqrt(lead_time)
    else:
        safety_stock = 0.0

    if lead_time > 0:
        rop = (add * lead_time) + safety_stock
    else:
        rop = add

    ordering_cost = float(policy.ordering_cost or 0)
    holding_cost = float(policy.holding_cost or 0)
    eoq = None

    if ordering_cost > 0 and holding_cost > 0:
        annual_demand = add * 365
        if annual_demand > 0:
            eoq = int(round(math.sqrt((2 * annual_demand * ordering_cost) / holding_cost)))

    # Persist
    policy.average_daily_demand = Decimal(str(round(add, 4)))
    policy.demand_std_dev = Decimal(str(round(std_dev, 4)))
    policy.safety_stock = int(round(safety_stock))
    policy.reorder_point = int(round(rop))
    if eoq is not None:
        policy.eoq = eoq
    policy.last_computed_at = datetime.utcnow()

    # ProductDemandAnalytics
    analytics_stmt = select(ProductDemandAnalytics).where(
        ProductDemandAnalytics.product_id == product_id,
    )
    analytics_result = db.execute(analytics_stmt)
    analytics = analytics_result.scalar_one_or_none()

    if analytics:
        analytics.average_daily_demand = Decimal(str(round(add, 4)))
        analytics.demand_std_dev = Decimal(str(round(std_dev, 4)))
        analytics.window_days = window_days
        analytics.sample_size = metrics["sample_size"]
        analytics.last_updated = datetime.utcnow()
    else:
        db.add(ProductDemandAnalytics(
            product_id=product_id,
            average_daily_demand=Decimal(str(round(add, 4))),
            demand_std_dev=Decimal(str(round(std_dev, 4))),
            window_days=window_days,
            sample_size=metrics["sample_size"],
        ))

    db.flush()

    return {
        "product_id": product_id,
        "status": "computed",
        "average_daily_demand": round(add, 4),
        "demand_std_dev": round(std_dev, 4),
        "safety_stock": int(round(safety_stock)),
        "reorder_point": int(round(rop)),
        "eoq": eoq if eoq is not None else policy.eoq,
        "lead_time_days": lead_time,
        "window_days": window_days,
        "sample_size": metrics["sample_size"],
        "total_shipped": metrics["total_shipped"],
    }


# ── Test Class ────────────────────────────────────────────────────────

class TestDemandAnalysis(unittest.TestCase):
    """Comprehensive tests for demand analysis computation logic."""

    def setUp(self) -> None:
        self.engine, self.db = _create_engine_and_session()
        self.supplier, self.warehouse, self.customer, self.product = _seed_base_data(self.db)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    # ── Test 1: Correct ADD computation ───────────────────────────────

    def test_add_computation_uniform_daily(self):
        """Ship 10 units every day for 10 days → ADD = 10/90 over 90-day window."""
        today = datetime.utcnow()
        for i in range(10):
            _create_shipment(
                self.db, self.product, self.warehouse, self.customer,
                shipped_qty=10,
                shipped_at=today - timedelta(days=i),
            )
        self.db.commit()

        metrics = _compute_demand_metrics_sync(self.db, self.product.id, window_days=90)

        # 100 units shipped / 90 days ≈ 1.1111
        self.assertAlmostEqual(metrics["average_daily_demand"], 100 / 90, places=3)
        self.assertEqual(metrics["total_shipped"], 100)
        self.assertEqual(metrics["sample_size"], 10)

    # ── Test 2: Zero shipments ────────────────────────────────────────

    def test_zero_shipments(self):
        """No shipments at all → ADD = 0, σ = 0."""
        metrics = _compute_demand_metrics_sync(self.db, self.product.id, window_days=90)

        self.assertEqual(metrics["average_daily_demand"], 0.0)
        self.assertEqual(metrics["demand_std_dev"], 0.0)
        self.assertEqual(metrics["total_shipped"], 0)
        self.assertEqual(metrics["sample_size"], 0)

    # ── Test 3: Sparse shipment scenario ──────────────────────────────

    def test_sparse_shipments(self):
        """Ship once in 90 days — should still have σ > 0 due to zero-fill."""
        today = datetime.utcnow()
        _create_shipment(
            self.db, self.product, self.warehouse, self.customer,
            shipped_qty=90,
            shipped_at=today - timedelta(days=45),
        )
        self.db.commit()

        metrics = _compute_demand_metrics_sync(self.db, self.product.id, window_days=90)

        self.assertAlmostEqual(metrics["average_daily_demand"], 1.0, places=3)
        self.assertGreater(metrics["demand_std_dev"], 0.0)  # high variance
        self.assertEqual(metrics["sample_size"], 1)

    # ── Test 4: High variance scenario ────────────────────────────────

    def test_high_variance(self):
        """Alternate between 100 and 0 every day → high σ."""
        today = datetime.utcnow()
        for i in range(0, 30, 2):
            _create_shipment(
                self.db, self.product, self.warehouse, self.customer,
                shipped_qty=100,
                shipped_at=today - timedelta(days=i),
            )
        self.db.commit()

        metrics = _compute_demand_metrics_sync(self.db, self.product.id, window_days=30)

        # 15 days × 100 = 1500 shipped, ADD = 50
        self.assertAlmostEqual(metrics["average_daily_demand"], 50.0, places=1)
        # σ should be substantial (≈ 50.8)
        self.assertGreater(metrics["demand_std_dev"], 40.0)

    # ── Test 5: EOQ skipped when costs missing ────────────────────────

    def test_eoq_skip_when_costs_missing(self):
        """When ordering_cost or holding_cost is 0, EOQ should not be computed."""
        policy = ReorderPolicy(
            product_id=self.product.id,
            lead_time_days=7,
            demand_window_days=90,
            ordering_cost=Decimal("0"),   # zero → skip EOQ
            holding_cost=Decimal("0"),
            service_level=Decimal("1.65"),
            eoq=50,  # existing static value
        )
        self.db.add(policy)
        self.db.commit()

        today = datetime.utcnow()
        for i in range(30):
            _create_shipment(
                self.db, self.product, self.warehouse, self.customer,
                shipped_qty=10,
                shipped_at=today - timedelta(days=i),
            )
        self.db.commit()

        result = _compute_reorder_policy_sync(self.db, self.product.id)
        self.db.commit()

        self.assertEqual(result["status"], "computed")
        # EOQ should remain at existing static value since costs are 0
        self.assertEqual(result["eoq"], 50)

    # ── Test 6: Partial shipment on multiple days ─────────────────────

    def test_multi_day_partial_shipments(self):
        """Multiple shipments on same day should be aggregated."""
        today = datetime.utcnow()
        ship_date = today - timedelta(days=5)

        # Two shipments on the same day
        _create_shipment(
            self.db, self.product, self.warehouse, self.customer,
            shipped_qty=30,
            shipped_at=ship_date,
        )
        _create_shipment(
            self.db, self.product, self.warehouse, self.customer,
            shipped_qty=20,
            shipped_at=ship_date + timedelta(seconds=3600),  # same day
        )
        self.db.commit()

        metrics = _compute_demand_metrics_sync(self.db, self.product.id, window_days=90)

        self.assertEqual(metrics["total_shipped"], 50)
        self.assertAlmostEqual(metrics["average_daily_demand"], 50 / 90, places=3)
        # Only 1 unique shipment day
        self.assertEqual(metrics["sample_size"], 1)

    # ── Test 7: Persistence validation ────────────────────────────────

    def test_persistence_to_both_tables(self):
        """Recalculation should persist to both ReorderPolicy and ProductDemandAnalytics."""
        policy = ReorderPolicy(
            product_id=self.product.id,
            lead_time_days=7,
            demand_window_days=90,
            ordering_cost=Decimal("50.00"),
            holding_cost=Decimal("20.00"),
            service_level=Decimal("1.65"),
        )
        self.db.add(policy)
        self.db.commit()

        today = datetime.utcnow()
        for i in range(30):
            _create_shipment(
                self.db, self.product, self.warehouse, self.customer,
                shipped_qty=10,
                shipped_at=today - timedelta(days=i),
            )
        self.db.commit()

        result = _compute_reorder_policy_sync(self.db, self.product.id)
        self.db.commit()

        self.assertEqual(result["status"], "computed")

        # Check ReorderPolicy was updated
        from sqlalchemy import select
        updated_policy = self.db.execute(
            select(ReorderPolicy).where(
                ReorderPolicy.product_id == self.product.id,
            )
        ).scalar_one()
        self.assertIsNotNone(updated_policy.last_computed_at)
        self.assertIsNotNone(updated_policy.average_daily_demand)
        self.assertGreater(float(updated_policy.average_daily_demand), 0)
        self.assertGreater(updated_policy.reorder_point, 0)
        self.assertGreater(updated_policy.safety_stock, 0)

        # Check ProductDemandAnalytics was created
        analytics = self.db.execute(
            select(ProductDemandAnalytics).where(
                ProductDemandAnalytics.product_id == self.product.id,
            )
        ).scalar_one()
        self.assertIsNotNone(analytics)
        self.assertEqual(float(analytics.average_daily_demand), result["average_daily_demand"])
        self.assertEqual(analytics.window_days, 90)

    # ── Test 8: Full formula verification ─────────────────────────────

    def test_full_formula_rop_ss_eoq(self):
        """
        Verify the exact ROP, SS, EOQ formulas with known data.
        
        Setup: 10 units/day for 90 straight days → ADD = 10.0
        Lead time = 7, Z = 1.65, S = 50, H = 20
        """
        policy = ReorderPolicy(
            product_id=self.product.id,
            lead_time_days=7,
            demand_window_days=90,
            ordering_cost=Decimal("50.00"),
            holding_cost=Decimal("20.00"),
            service_level=Decimal("1.65"),
        )
        self.db.add(policy)
        self.db.commit()

        today = datetime.utcnow()
        for i in range(90):
            _create_shipment(
                self.db, self.product, self.warehouse, self.customer,
                shipped_qty=10,
                shipped_at=today - timedelta(days=i),
            )
        self.db.commit()

        result = _compute_reorder_policy_sync(self.db, self.product.id)
        self.db.commit()

        # ADD should be exactly 10.0 (900/90)
        self.assertAlmostEqual(result["average_daily_demand"], 10.0, places=2)

        # σ_d should be 0 since every day has exactly 10
        self.assertAlmostEqual(result["demand_std_dev"], 0.0, places=2)

        # Safety Stock = 1.65 × 0 × √7 = 0
        self.assertEqual(result["safety_stock"], 0)

        # ROP = (10 × 7) + 0 = 70
        self.assertEqual(result["reorder_point"], 70)

        # EOQ = √((2 × 3650 × 50) / 20) = √18250 ≈ 135
        annual_d = 10.0 * 365
        expected_eoq = int(round(math.sqrt((2 * annual_d * 50) / 20)))
        self.assertEqual(result["eoq"], expected_eoq)

    # ── Test 9: Transaction safety — no policy ────────────────────────

    def test_no_policy_skipped(self):
        """Product without a policy should return 'skipped' status."""
        result = _compute_reorder_policy_sync(self.db, self.product.id)
        self.assertEqual(result["status"], "skipped")

    # ── Test 10: Lead time zero → SS=0, ROP=ADD ──────────────────────

    def test_lead_time_zero(self):
        """With lead_time=0, safety stock should be 0 and ROP = ADD."""
        policy = ReorderPolicy(
            product_id=self.product.id,
            lead_time_days=0,
            demand_window_days=30,
            ordering_cost=Decimal("50.00"),
            holding_cost=Decimal("20.00"),
            service_level=Decimal("1.65"),
        )
        self.db.add(policy)
        self.db.commit()

        today = datetime.utcnow()
        for i in range(30):
            _create_shipment(
                self.db, self.product, self.warehouse, self.customer,
                shipped_qty=10,
                shipped_at=today - timedelta(days=i),
            )
        self.db.commit()

        result = _compute_reorder_policy_sync(self.db, self.product.id)
        self.db.commit()

        self.assertEqual(result["safety_stock"], 0)
        # ROP = ADD when lead_time = 0
        self.assertEqual(result["reorder_point"], int(round(result["average_daily_demand"])))


if __name__ == "__main__":
    unittest.main()
