"""
Comprehensive tests for Inventory Health Intelligence Module.

Tests detection logic (dead stock, slow-moving, expiry), severity scoring,
action suggestion generation, and the approval workflow.

Uses async SQLAlchemy with SQLite (aiosqlite) matching the app's async architecture.
"""

import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)

from app.core.database import Base
from app.models.products import Product
from app.models.inventory import Inventory
from app.models.orders import SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem
from app.models.supplier import Supplier
from app.models.receipt import Receipt, ReceiptItem
from app.models.warehouse import Warehouse
from app.models.promotion import Promotion
from app.models.bundle import Bundle, BundleItem
from app.models.inventory_health import (
    InventoryHealthStatus,
    InventoryActionSuggestion,
    InventoryOptimizationConfig,
    HealthType,
    SuggestionType,
    SuggestionStatus,
)
from app.services.inventory_health_service import InventoryHealthService
from app.services.action_suggestion_engine import ActionSuggestionEngine


# ── Fixtures ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Create a fresh in-memory async SQLite DB for each test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def seed_warehouse(db_session: AsyncSession):
    """Create a basic warehouse."""
    wh = Warehouse(id=1, name="Main Warehouse", location="HQ")
    db_session.add(wh)
    await db_session.flush()
    return wh


@pytest_asyncio.fixture
async def seed_supplier(db_session: AsyncSession):
    """Create a supplier that allows returns."""
    supplier = Supplier(
        id=1,
        name="FastSupply Co.",
        allows_return=True,
        return_window_days=60,
    )
    db_session.add(supplier)
    await db_session.flush()
    return supplier


@pytest_asyncio.fixture
async def seed_config(db_session: AsyncSession):
    """Create optimization config with defaults."""
    config = InventoryOptimizationConfig(
        id=1,
        dead_days_threshold=90,
        slow_turnover_threshold=Decimal("1.0"),
        expiry_warning_days=30,
        auto_discount_enabled=False,
        auto_bundle_enabled=False,
        max_discount_limit=Decimal("30.0"),
        low_risk_severity_threshold=Decimal("40.0"),
    )
    db_session.add(config)
    await db_session.flush()
    return config


# ── Helper ────────────────────────────────────────────────────────────

def _days_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=n)


def _date_days_ago(n: int) -> date:
    return date.today() - timedelta(days=n)


def _date_days_from_now(n: int) -> date:
    return date.today() + timedelta(days=n)


# ── 1. Dead Stock Detection ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_dead_stock_detection(db_session, seed_warehouse, seed_config):
    """Product with no sales in 100 days → detected as DEAD, severity = 50."""
    db = db_session

    product = Product(id=1, sku="DEAD-001", name="Dead Widget", unit_price=Decimal("10.00"))
    db.add(product)
    await db.flush()

    inv = Inventory(
        product_id=1,
        warehouse_id=1,
        batch_number="B001",
        quantity=50,
        allocated=0,
        available=50,
        received_date=_date_days_ago(100),
        status="ACTIVE",
    )
    db.add(inv)
    await db.flush()

    config = seed_config
    results = await InventoryHealthService.detect_dead_stock(db, config)

    assert len(results) == 1
    assert results[0].health_type == HealthType.DEAD
    assert results[0].product_id == 1
    assert float(results[0].severity_score) == 50.0  # 100 * 0.5
    assert results[0].details["days_without_sale"] == 100


@pytest.mark.asyncio
async def test_dead_stock_not_detected_with_recent_sale(
    db_session, seed_warehouse, seed_config
):
    """Product with a recent sale should NOT be flagged as dead."""
    db = db_session

    product = Product(id=1, sku="LIVE-001", name="Active Widget", unit_price=Decimal("10.00"))
    db.add(product)
    await db.flush()

    inv = Inventory(
        product_id=1,
        warehouse_id=1,
        quantity=50,
        allocated=0,
        available=50,
        received_date=_date_days_ago(100),
        status="ACTIVE",
    )
    db.add(inv)

    # Recent delivered sale
    so = SalesOrder(
        id=1,
        order_number="SO-001",
        customer_id=1,
        warehouse_id=1,
        status="DELIVERED",
        created_at=_days_ago(10),
    )
    db.add(so)
    await db.flush()

    soi = SalesOrderItem(
        sales_order_id=1,
        product_id=1,
        ordered_qty=5,
        picked_qty=5,
        created_at=_days_ago(10),
    )
    db.add(soi)
    await db.flush()

    config = seed_config
    results = await InventoryHealthService.detect_dead_stock(db, config)
    assert len(results) == 0


# ── 2. Slow-Moving Detection ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_slow_moving_detection(db_session, seed_warehouse, seed_config):
    """Product with low turnover ratio → detected as SLOW."""
    db = db_session

    product = Product(id=1, sku="SLOW-001", name="Slow Mover", unit_price=Decimal("20.00"))
    db.add(product)
    await db.flush()

    inv = Inventory(
        product_id=1,
        warehouse_id=1,
        quantity=100,
        allocated=0,
        available=100,
        received_date=_date_days_ago(120),
        status="ACTIVE",
    )
    db.add(inv)

    # Only sold 2 units in 90 days — turnover = 2/100 = 0.02
    so = SalesOrder(
        id=1,
        order_number="SO-SLOW-001",
        customer_id=1,
        warehouse_id=1,
        status="DELIVERED",
        created_at=_days_ago(30),
    )
    db.add(so)
    await db.flush()

    soi = SalesOrderItem(
        sales_order_id=1,
        product_id=1,
        ordered_qty=2,
        picked_qty=2,
        created_at=_days_ago(30),
    )
    db.add(soi)
    await db.flush()

    config = seed_config
    results = await InventoryHealthService.detect_slow_moving(db, config)

    assert len(results) == 1
    assert results[0].health_type == HealthType.SLOW
    details = results[0].details
    assert details["turnover_ratio"] < 1.0
    # Severity = (1 - 0.02) * 100 = 98.0
    assert float(results[0].severity_score) == 98.0


# ── 3. Expiry Risk Detection ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_near_expiry_detection(db_session, seed_warehouse, seed_config):
    """Batch expiring in 10 days → severity = 80."""
    db = db_session

    product = Product(id=1, sku="EXP-001", name="Milk", unit_price=Decimal("5.00"))
    db.add(product)
    await db.flush()

    inv = Inventory(
        product_id=1,
        warehouse_id=1,
        batch_number="BATCH-EXP",
        quantity=30,
        allocated=0,
        available=30,
        expiry_date=_date_days_from_now(10),
        received_date=_date_days_ago(20),
        status="ACTIVE",
    )
    db.add(inv)
    await db.flush()

    config = seed_config
    results = await InventoryHealthService.detect_expiry_risk(db, config)

    assert len(results) == 1
    assert results[0].health_type == HealthType.EXPIRY
    # severity = 100 - (10 * 2) = 80
    assert float(results[0].severity_score) == 80.0
    assert results[0].details["days_to_expiry"] == 10
    assert results[0].details["is_expired"] is False


@pytest.mark.asyncio
async def test_expired_batch_detection(db_session, seed_warehouse, seed_config):
    """Already expired → severity = 100."""
    db = db_session

    product = Product(id=1, sku="EXP-002", name="Expired Yogurt", unit_price=Decimal("3.00"))
    db.add(product)
    await db.flush()

    inv = Inventory(
        product_id=1,
        warehouse_id=1,
        batch_number="BATCH-OLD",
        quantity=20,
        allocated=0,
        available=20,
        expiry_date=_date_days_ago(5),
        received_date=_date_days_ago(60),
        status="ACTIVE",
    )
    db.add(inv)
    await db.flush()

    config = seed_config
    results = await InventoryHealthService.detect_expiry_risk(db, config)

    assert len(results) == 1
    assert float(results[0].severity_score) == 100.0
    assert results[0].details["is_expired"] is True


# ── 4. Discount Suggestion ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_discount_suggestion_for_slow_moving(
    db_session, seed_warehouse, seed_config
):
    """Slow-moving product → DISCOUNT suggestion with calculated percentage."""
    db = db_session

    product = Product(id=1, sku="DISC-001", name="Slow Item", unit_price=Decimal("25.00"))
    db.add(product)
    await db.flush()

    # Create a health status for the slow item
    hs = InventoryHealthStatus(
        product_id=1,
        warehouse_id=1,
        health_type=HealthType.SLOW,
        severity_score=Decimal("80.0"),
        details={
            "turnover_ratio": 0.2,
            "sold_qty_90d": 5,
            "avg_inventory": 100,
            "total_available": 100,
        },
    )
    db.add(hs)
    await db.flush()

    config = seed_config
    suggestions = await ActionSuggestionEngine.generate_suggestions(db, [hs], config)

    discount_sug = [s for s in suggestions if s.suggestion_type == SuggestionType.DISCOUNT]
    assert len(discount_sug) >= 1

    sug = discount_sug[0]
    assert sug.status == SuggestionStatus.PENDING
    assert sug.suggested_discount_percent is not None
    assert float(sug.suggested_discount_percent) >= 5.0  # At least base discount
    assert sug.linked_promotion_id is not None


# ── 5. Bundle Suggestion ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bundle_suggestion_for_dead_stock(
    db_session, seed_warehouse, seed_config
):
    """Dead stock + fast-moving product → BUNDLE suggestion created."""
    db = db_session

    dead_product = Product(
        id=1, sku="DEAD-BUN", name="Dead Gadget",
        unit_price=Decimal("50.00"), category="Electronics",
    )
    fast_product = Product(
        id=2, sku="FAST-BUN", name="Popular Charger",
        unit_price=Decimal("15.00"), category="Electronics",
    )
    db.add(dead_product)
    db.add(fast_product)
    await db.flush()

    # Fast-moving: recent sales
    so = SalesOrder(
        id=1, order_number="SO-FAST",
        customer_id=1, warehouse_id=1,
        status="DELIVERED", created_at=_days_ago(10),
    )
    db.add(so)
    await db.flush()

    soi = SalesOrderItem(
        sales_order_id=1, product_id=2,
        ordered_qty=200, picked_qty=200,
        created_at=_days_ago(10),
    )
    db.add(soi)
    await db.flush()

    # Dead stock health status
    hs = InventoryHealthStatus(
        product_id=1,
        warehouse_id=1,
        health_type=HealthType.DEAD,
        severity_score=Decimal("60.0"),
        details={"days_without_sale": 120, "total_available": 30},
    )
    db.add(hs)
    await db.flush()

    config = seed_config
    suggestions = await ActionSuggestionEngine.generate_suggestions(db, [hs], config)

    bundle_sug = [s for s in suggestions if s.suggestion_type == SuggestionType.BUNDLE]
    assert len(bundle_sug) == 1

    sug = bundle_sug[0]
    assert sug.linked_bundle_id is not None
    assert sug.status == SuggestionStatus.PENDING


# ── 6. Disposal Suggestion ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_disposal_suggestion_for_expired(db_session, seed_warehouse, seed_config):
    """Expired product → DISPOSAL suggestion."""
    db = db_session

    product = Product(id=1, sku="DISP-001", name="Expired Item", unit_price=Decimal("10.00"))
    db.add(product)
    await db.flush()

    hs = InventoryHealthStatus(
        product_id=1,
        warehouse_id=1,
        batch_id=None,
        health_type=HealthType.EXPIRY,
        severity_score=Decimal("100.0"),
        details={
            "days_to_expiry": -5,
            "is_expired": True,
            "batch_number": "B-OLD",
            "quantity": 20,
            "potential_loss": 200.0,
        },
    )
    db.add(hs)
    await db.flush()

    config = seed_config
    suggestions = await ActionSuggestionEngine.generate_suggestions(db, [hs], config)

    disposal = [s for s in suggestions if s.suggestion_type == SuggestionType.DISPOSAL]
    assert len(disposal) >= 1
    assert disposal[0].status == SuggestionStatus.PENDING


# ── 7. Return to Supplier Suggestion ─────────────────────────────────

@pytest.mark.asyncio
async def test_return_suggestion(db_session, seed_warehouse, seed_supplier, seed_config):
    """Supplier allows return + receipt within window → RETURN suggestion."""
    db = db_session

    product = Product(
        id=1, sku="RET-001", name="Returnable Item",
        unit_price=Decimal("50.00"), supplier_id=1,
    )
    db.add(product)
    await db.flush()

    # Recent receipt (within 60-day window)
    receipt = Receipt(
        id=1, receipt_number="REC-001",
        received_at=_days_ago(20),
    )
    db.add(receipt)
    await db.flush()

    ri = ReceiptItem(
        receipt_id=1, product_id=1,
        received_qty=50, batch_number="B-RET",
    )
    db.add(ri)
    await db.flush()

    hs = InventoryHealthStatus(
        product_id=1,
        warehouse_id=1,
        health_type=HealthType.DEAD,
        severity_score=Decimal("45.0"),
        details={"days_without_sale": 90, "total_available": 50},
    )
    db.add(hs)
    await db.flush()

    config = seed_config
    suggestions = await ActionSuggestionEngine.generate_suggestions(db, [hs], config)

    return_sug = [s for s in suggestions if s.suggestion_type == SuggestionType.RETURN]
    assert len(return_sug) == 1
    assert "FastSupply" in return_sug[0].reasoning


# ── 8. Approval Workflow ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_approve_action_activates_promotion(
    db_session, seed_warehouse, seed_config
):
    """Approving a DISCOUNT suggestion activates its linked promotion."""
    db = db_session

    product = Product(id=1, sku="APR-001", name="Approve Test", unit_price=Decimal("30.00"))
    db.add(product)
    await db.flush()

    # Create inactive promotion
    promo = Promotion(
        id=1, name="Test Discount", product_id=1,
        discount_type="PERCENTAGE", discount_value=Decimal("15.0"),
        valid_from=datetime.now(timezone.utc),
        is_active=False, approval_status="PENDING",
    )
    db.add(promo)
    await db.flush()

    # Create PENDING suggestion linked to promotion
    sug = InventoryActionSuggestion(
        id=1, product_id=1, warehouse_id=1,
        suggestion_type=SuggestionType.DISCOUNT,
        reasoning="Test",
        severity_score=Decimal("50.0"),
        suggested_discount_percent=Decimal("15.0"),
        linked_promotion_id=1,
        status=SuggestionStatus.PENDING,
    )
    db.add(sug)
    await db.flush()

    result = await ActionSuggestionEngine.approve_action(db, 1, approved_by=42)

    assert result.status == SuggestionStatus.APPROVED
    assert result.approved_by == 42

    # Check promotion was activated
    from sqlalchemy import select
    promo_result = await db.execute(select(Promotion).where(Promotion.id == 1))
    updated_promo = promo_result.scalar_one()
    assert updated_promo.is_active is True


# ── 9. Rejection Workflow ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reject_action(db_session, seed_warehouse):
    """Rejecting a suggestion sets status correctly."""
    db = db_session

    product = Product(id=1, sku="REJ-001", name="Reject Test", unit_price=Decimal("10.00"))
    db.add(product)
    await db.flush()

    sug = InventoryActionSuggestion(
        id=1, product_id=1, warehouse_id=1,
        suggestion_type=SuggestionType.DISPOSAL,
        reasoning="Expired",
        severity_score=Decimal("100.0"),
        status=SuggestionStatus.PENDING,
    )
    db.add(sug)
    await db.flush()

    result = await ActionSuggestionEngine.reject_action(db, 1, reason="Still usable")
    assert result.status == SuggestionStatus.REJECTED


# ── 10. Config Defaults ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_config_defaults(db_session):
    """Verify optimization config returns correct defaults."""
    db = db_session
    config = await InventoryHealthService.get_or_create_config(db)

    assert config.dead_days_threshold == 90
    assert float(config.slow_turnover_threshold) == 1.0
    assert config.expiry_warning_days == 30
    assert config.auto_discount_enabled is False
    assert config.auto_bundle_enabled is False
    assert float(config.max_discount_limit) == 30.0


@pytest.mark.asyncio
async def test_config_update(db_session):
    """Verify config can be partially updated."""
    db = db_session
    await InventoryHealthService.get_or_create_config(db)

    updated = await InventoryHealthService.update_config(db, {
        "dead_days_threshold": 60,
        "auto_discount_enabled": True,
    })

    assert updated.dead_days_threshold == 60
    assert updated.auto_discount_enabled is True
    assert updated.expiry_warning_days == 30  # Unchanged


# ── 11. Execute Action ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_requires_approval(db_session, seed_warehouse):
    """Cannot execute a PENDING suggestion — must be APPROVED first."""
    db = db_session

    product = Product(id=1, sku="EXE-001", name="Exec Test", unit_price=Decimal("10.00"))
    db.add(product)
    await db.flush()

    sug = InventoryActionSuggestion(
        id=1, product_id=1, warehouse_id=1,
        suggestion_type=SuggestionType.DISPOSAL,
        reasoning="Test",
        severity_score=Decimal("90.0"),
        status=SuggestionStatus.PENDING,
    )
    db.add(sug)
    await db.flush()

    with pytest.raises(ValueError, match="Must be APPROVED"):
        await ActionSuggestionEngine.execute_action(db, 1)


@pytest.mark.asyncio
async def test_execute_after_approval(db_session, seed_warehouse):
    """Can execute after approval."""
    db = db_session

    product = Product(id=1, sku="EXE-002", name="Exec OK", unit_price=Decimal("10.00"))
    db.add(product)
    await db.flush()

    sug = InventoryActionSuggestion(
        id=1, product_id=1, warehouse_id=1,
        suggestion_type=SuggestionType.DISPOSAL,
        reasoning="Test",
        severity_score=Decimal("90.0"),
        status=SuggestionStatus.APPROVED,
    )
    db.add(sug)
    await db.flush()

    result = await ActionSuggestionEngine.execute_action(db, 1)
    assert result.status == SuggestionStatus.EXECUTED


# ── 12. Full Scan ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_scan_orchestration(db_session, seed_warehouse, seed_config):
    """Run full scan → health statuses and suggestions created."""
    db = db_session

    # Product with expiring stock
    product = Product(id=1, sku="SCAN-001", name="Scan Product", unit_price=Decimal("15.00"))
    db.add(product)
    await db.flush()

    inv = Inventory(
        product_id=1,
        warehouse_id=1,
        batch_number="SCAN-B",
        quantity=40,
        allocated=0,
        available=40,
        expiry_date=_date_days_from_now(5),
        received_date=_date_days_ago(25),
        status="ACTIVE",
    )
    db.add(inv)
    await db.flush()

    result = await ActionSuggestionEngine.run_full_scan(db)

    assert result["expiry_risk_detected"] >= 1
    assert result["suggestions_generated"] >= 1
    assert result["scan_duration_seconds"] >= 0
