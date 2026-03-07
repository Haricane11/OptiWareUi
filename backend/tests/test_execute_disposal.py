import pytest
import asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.main import app
from app.models.inventory import Inventory, InventoryTransaction
from app.models.products import Product
from app.models.inventory_health import InventoryActionSuggestion, SuggestionType, SuggestionStatus
from app.models.warehouse import Warehouse

from httpx import AsyncClient, ASGITransport

@pytest.fixture
async def setup_disposal_data(db_session: AsyncSession):
    # Ensure warehouse & product exist
    wh = Warehouse(name="Test WH", location="Test Loc")
    db_session.add(wh)
    await db_session.flush()

    prod = Product(name="Disposal Test Product", sku="DISP-001", cost=10.0, unit_price=20.0)
    db_session.add(prod)
    await db_session.flush()

    # Create active inventory of 100
    inv = Inventory(
        product_id=prod.id,
        warehouse_id=wh.id,
        quantity=100,
        available=100,
        status="ACTIVE"
    )
    db_session.add(inv)
    await db_session.flush()

    # Create approved suggestion
    sug = InventoryActionSuggestion(
        product_id=prod.id,
        warehouse_id=wh.id,
        batch_id=inv.id,
        suggestion_type=SuggestionType.DISPOSAL,
        reasoning="Test",
        status=SuggestionStatus.APPROVED
    )
    db_session.add(sug)
    await db_session.commit()
    
    yield {"warehouse": wh, "product": prod, "inventory": inv, "suggestion": sug}

    # Cleanup
    await db_session.execute(delete(InventoryTransaction))
    await db_session.execute(delete(InventoryActionSuggestion))
    await db_session.execute(delete(Inventory))
    await db_session.execute(delete(Product).where(Product.sku == "DISP-001"))
    await db_session.execute(delete(Warehouse).where(Warehouse.name == "Test WH"))
    await db_session.commit()

@pytest.mark.asyncio
async def test_disposal_inventory_deduction_and_ledger(db_session: AsyncSession, setup_disposal_data):
    sug_id = setup_disposal_data["suggestion"].id
    
    # 1. Execute
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"/analytics/inventory-actions/{sug_id}/execute")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["executed_quantity"] == 100
    assert data["remaining_inventory"] == 0
    assert data["write_off_value"] == 1000.0  # 100 * 10.0
    
    # 2. Verify Suggestion Status
    stmt = select(InventoryActionSuggestion).where(InventoryActionSuggestion.id == sug_id)
    sug = (await db_session.execute(stmt)).scalar_one()
    assert sug.status == SuggestionStatus.EXECUTED
    
    # 3. Verify Inventory Status
    inv_stmt = select(Inventory).where(Inventory.id == setup_disposal_data["inventory"].id)
    inv = (await db_session.execute(inv_stmt)).scalar_one()
    assert inv.quantity == 0
    assert inv.available == 0
    assert inv.status == "DEPLETED"
    
    # 4. Verify Ledger Transaction
    trans_stmt = select(InventoryTransaction).where(InventoryTransaction.reference_action_id == sug_id)
    trans = (await db_session.execute(trans_stmt)).scalar_one()
    assert trans.transaction_type == "WRITE_OFF"
    assert trans.quantity == 100

@pytest.mark.asyncio
async def test_disposal_idempotency_protection(db_session: AsyncSession, setup_disposal_data):
    sug_id = setup_disposal_data["suggestion"].id
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First execution succeeds
        r1 = await client.post(f"/analytics/inventory-actions/{sug_id}/execute")
        assert r1.status_code == 200
        
        # Second execution fails with 409
        r2 = await client.post(f"/analytics/inventory-actions/{sug_id}/execute")
        assert r2.status_code == 409
        assert r2.json()["detail"] == "Action already executed."

@pytest.mark.asyncio
async def test_partial_disposal_capped_quantity(db_session: AsyncSession):
    # Ensure warehouse & product exist
    wh = Warehouse(name="Test WH 2", location="Test Loc 2")
    db_session.add(wh)
    await db_session.flush()

    prod = Product(name="Disposal Test Product 2", sku="DISP-002", cost=5.0, unit_price=10.0)
    db_session.add(prod)
    await db_session.flush()

    # Create active inventory of 10, but some allocated
    inv = Inventory(
        product_id=prod.id,
        warehouse_id=wh.id,
        quantity=10,
        available=4,  # only 4 available
        status="ACTIVE"
    )
    db_session.add(inv)
    await db_session.flush()

    # Create approved suggestion
    sug = InventoryActionSuggestion(
        product_id=prod.id,
        warehouse_id=wh.id,
        batch_id=inv.id,
        suggestion_type=SuggestionType.DISPOSAL,
        reasoning="Test Partial",
        status=SuggestionStatus.APPROVED
    )
    db_session.add(sug)
    await db_session.commit()
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"/analytics/inventory-actions/{sug.id}/execute")
    assert response.status_code == 200
    data = response.json()
    assert data["executed_quantity"] == 4  # Should cap to available
    assert data["remaining_inventory"] == 6  # 10 - 4
    assert data["write_off_value"] == 20.0  # 4 * 5.0
    
    # Verify DB
    inv_stmt = select(Inventory).where(Inventory.id == inv.id)
    inv_db = (await db_session.execute(inv_stmt)).scalar_one()
    assert inv_db.quantity == 6
    assert inv_db.available == 0
    assert inv_db.status == "ACTIVE"  # still has allocated
    
    # Cleanup
    await db_session.execute(delete(InventoryTransaction))
    await db_session.execute(delete(InventoryActionSuggestion))
    await db_session.execute(delete(Inventory))
    await db_session.execute(delete(Product).where(Product.sku == "DISP-002"))
    await db_session.execute(delete(Warehouse).where(Warehouse.name == "Test WH 2"))
    await db_session.commit()
    
