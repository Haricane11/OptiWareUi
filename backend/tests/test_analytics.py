from datetime import datetime, timedelta
from app.services.analytics_service import InventoryAnalyticsService
from app.models import Product, ReorderPolicy, SalesOrder, SalesOrderItem, PurchaseOrder, Inventory, GoodsReceipt, GoodsReceiptItem
from sqlalchemy.orm import Session

def test_rop_calculation(db_session: Session):
    # Setup
    prod = Product(name="Test Product", unit_price=10.0)
    db_session.add(prod)
    db_session.commit()
    
    # 30 days of sales, 1 unit per day = 30 units total. Avg daily = 1.
    order = SalesOrder(order_date=datetime.now() - timedelta(days=5))
    db_session.add(order)
    db_session.commit()
    
    item = SalesOrderItem(sales_order_id=order.id, product_id=prod.id, quantity=30)
    db_session.add(item)
    
    # Safety stock policy = 5
    policy = ReorderPolicy(product_id=prod.id, safety_stock=5)
    db_session.add(policy)
    db_session.commit()
    
    # Calculate ROP
    # ROP = (Avg Daily * Lead Time) + Safety Stock
    # Avg Daily = 30 / 30 = 1.
    # Lead Time = 7 (default).
    # ROP = (1 * 7) + 5 = 12.
    
    result = InventoryAnalyticsService.calculate_rop(db_session, prod.id, lead_time_days=7)
    
    assert result["rop"] == 12
    assert result["avg_daily_demand"] == 1.0

def test_eoq_calculation(db_session: Session):
    # Setup
    prod = Product(name="EOQ Product", unit_price=100.0) # Cost $100
    db_session.add(prod)
    db_session.commit()
    
    # Annual demand needs 365 daily demand.
    # Let's say avg daily = 10. Annual = 3650.
    order = SalesOrder(order_date=datetime.now())
    db_session.add(order)
    db_session.commit()
    
    # Fake sales history to get 10 units/day over 30 days = 300 units
    item = SalesOrderItem(sales_order_id=order.id, product_id=prod.id, quantity=300)
    db_session.add(item)
    db_session.commit()
    
    # EOQ = sqrt(2 * D * S / H)
    # D = 3650
    # S = 50 (ordering cost)
    # H = 100 * 0.2 = 20 (holding cost)
    # EOQ = sqrt(2 * 3650 * 50 / 20) = sqrt(18250) = 135.09 -> 135
    
    result = InventoryAnalyticsService.calculate_eoq(db_session, prod.id, ordering_cost=50, holding_cost_pct=0.2)
    
    assert result["eoq"] == 135

def test_dead_stock_detection(db_session: Session):
    # Setup
    prod = Product(name="Old Product", unit_price=10.0)
    db_session.add(prod)
    db_session.commit()
    
    # Inventory updated 100 days ago
    inv = Inventory(
        product_id=prod.id, 
        shelf_id=1, 
        warehouse_id=1, 
        quantity=10,
        last_updated=datetime.now() - timedelta(days=100)
    )
    db_session.add(inv)
    db_session.commit()
    
    dead_stock = InventoryAnalyticsService.detect_dead_stock(db_session, threshold_days=90)
    
    assert len(dead_stock) == 1
    assert dead_stock[0]["product_id"] == prod.id
    assert dead_stock[0]["quantity"] == 10
    
    # Should not be dead if threshold is 120
    not_dead = InventoryAnalyticsService.detect_dead_stock(db_session, threshold_days=120)
    assert len(not_dead) == 0

def test_expiry_risk_detection(db_session: Session):
    # Setup
    prod = Product(name="Milk", unit_price=5.0, expiry_days=10) # 10 days shelf life
    db_session.add(prod)
    db_session.commit()
    
    # Receipt 8 days ago. Expiry in 2 days.
    receipt = GoodsReceipt(received_at=datetime.now() - timedelta(days=8))
    db_session.add(receipt)
    db_session.commit()
    
    receipt_item = GoodsReceiptItem(goods_receipt_id=receipt.id, product_id=prod.id, quantity=50)
    db_session.add(receipt_item)
    
    # Current Inventory matches receipt
    inv = Inventory(product_id=prod.id, shelf_id=1, warehouse_id=1, quantity=50)
    db_session.add(inv)
    db_session.commit()
    
    # Check risk with threshold 5 days (expiry in 2 days < 5 days -> Risk)
    risky = InventoryAnalyticsService.detect_expiry_risk(db_session, threshold_days=5)
    
    assert len(risky) == 1
    assert risky[0]["product_id"] == prod.id
    assert risky[0]["days_until_expiry"] <= 2

def test_inventory_turnover(db_session: Session):
    # Setup
    prod = Product(name="Fast Mover", unit_price=20.0)
    db_session.add(prod)
    db_session.commit()
    
    # Sales: Sold 100 units in last 30 days
    order = SalesOrder(order_date=datetime.now() - timedelta(days=15))
    db_session.add(order)
    db_session.commit()
    item = SalesOrderItem(sales_order_id=order.id, product_id=prod.id, quantity=100)
    db_session.add(item)
    
    # Current Inventory: 10 units
    inv = Inventory(product_id=prod.id, shelf_id=1, warehouse_id=1, quantity=10)
    db_session.add(inv)
    db_session.commit()
    
    # Logic:
    # COGS = 100 units * $20 = $2000
    # Avg Inv = 10 units * $20 = $200
    # Turnover = 2000 / 200 = 10
    
    result = InventoryAnalyticsService.calculate_inventory_turnover(db_session, period_days=30)
    
    assert result["cogs"] == 2000.0
    assert result["average_inventory_value"] == 200.0
    assert result["turnover_ratio"] == 10.0
