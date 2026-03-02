import unittest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.models import Product, ReorderPolicy, SalesOrder, SalesOrderItem, PurchaseOrder, Inventory, Receipt, ReceiptItem
from app.services.analytics_service import AnalyticsService

class TestInventoryAnalytics(unittest.TestCase):
    
    def setUp(self):
        # Setup in-memory DB
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.SessionLocal()
        
    def tearDown(self):
        self.db.close()
        
    def test_rop_calculation(self):
        # Setup
        prod = Product(sku="PROD-001", name="Test Product", unit_price=10.0)
        self.db.add(prod)
        self.db.commit()
        
        # 30 days of sales, 1 unit per day = 30 units total. Avg daily = 1.
        order = SalesOrder(order_number="SO-1", customer_id=1, warehouse_id=1, status="DELIVERED", order_date=datetime.now() - timedelta(days=5))
        self.db.add(order)
        self.db.commit()
        
        item = SalesOrderItem(sales_order_id=order.id, product_id=prod.id, ordered_qty=30, picked_qty=30)
        self.db.add(item)
        
        # Safety stock policy = 5
        policy = ReorderPolicy(product_id=prod.id, safety_stock=5)
        self.db.add(policy)
        self.db.commit()
        
        # ROP = (1 * 7) + 5 = 12
        result = AnalyticsService.calculate_rop(self.db, prod.id, lead_time_days=7)
        
        self.assertEqual(result["rop"], 12)
        self.assertEqual(result["avg_daily_demand"], 1.0)

    def test_eoq_calculation(self):
        # Setup
        prod = Product(sku="PROD-002", name="EOQ Product", unit_price=100.0) # Cost $100
        self.db.add(prod)
        self.db.commit()
        
        # 365 daily demand. Avg daily = 10. Annual = 3650.
        order = SalesOrder(order_number="SO-2", customer_id=1, warehouse_id=1, status="DELIVERED", order_date=datetime.now())
        self.db.add(order)
        self.db.commit()
        
        # Fake sales history to get 10 units/day over 30 days = 300 units
        item = SalesOrderItem(sales_order_id=order.id, product_id=prod.id, ordered_qty=300, picked_qty=300)
        self.db.add(item)
        self.db.commit()
        
        # EOQ = sqrt(2 * 3650 * 50 / 20) = 135
        result = AnalyticsService.calculate_eoq(self.db, prod.id, ordering_cost=50, holding_cost_pct=0.2)
        
        self.assertEqual(result["eoq"], 135)

    def test_dead_stock_detection(self):
        # Setup
        prod = Product(sku="PROD-003", name="Old Product", unit_price=10.0)
        self.db.add(prod)
        self.db.commit()
        
        # Inventory updated 100 days ago
        inv = Inventory(
            product_id=prod.id, 
            shelf_id=1, 
            warehouse_id=1, 
            quantity=10,
            created_at=datetime.now() - timedelta(days=100)
        )
        self.db.add(inv)
        self.db.commit()
        
        dead_stock = AnalyticsService.detect_dead_stock(self.db, threshold_days=90)
        
        self.assertEqual(len(dead_stock), 1)
        self.assertEqual(dead_stock[0]["product_id"], prod.id)
        
        not_dead = AnalyticsService.detect_dead_stock(self.db, threshold_days=120)
        self.assertEqual(len(not_dead), 0)

    def test_expiry_risk_detection(self):
        # Setup
        prod = Product(sku="PROD-004", name="Milk", unit_price=5.0)
        self.db.add(prod)
        self.db.commit()
        
        # Receipt 8 days ago. Expiry in 2 days.
        receipt = Receipt(receipt_number="REC-001", received_at=datetime.now() - timedelta(days=8))
        self.db.add(receipt)
        self.db.commit()
        
        receipt_item = ReceiptItem(receipt_id=receipt.id, product_id=prod.id, received_qty=50)
        self.db.add(receipt_item)
        
        # Current Inventory matches receipt
        inv = Inventory(product_id=prod.id, shelf_id=1, warehouse_id=1, quantity=50)
        self.db.add(inv)
        self.db.commit()
        
        # Check risk with threshold 5 days (expiry in 2 days < 5 days -> Risk)
        risky = AnalyticsService.detect_expiry_risk(self.db, threshold_days=5)
        
        self.assertEqual(len(risky), 1)
        self.assertEqual(risky[0]["product_id"], prod.id)

    def test_inventory_turnover(self):
        # Setup
        prod = Product(sku="PROD-005", name="Fast Mover", unit_price=20.0)
        self.db.add(prod)
        self.db.commit()
        
        # Sales: Sold 100 units in last 30 days
        order = SalesOrder(order_number="SO-3", customer_id=1, warehouse_id=1, status="DELIVERED", order_date=datetime.now() - timedelta(days=15), created_at=datetime.now() - timedelta(days=15))
        self.db.add(order)
        self.db.commit()
        item = SalesOrderItem(sales_order_id=order.id, product_id=prod.id, ordered_qty=100, picked_qty=100)
        self.db.add(item)
        
        # Current Inventory: 10 units
        inv = Inventory(product_id=prod.id, shelf_id=1, warehouse_id=1, quantity=10)
        self.db.add(inv)
        self.db.commit()
        
        # COGS = 100 * 20 = 2000. Avg Inv = 10 * 20 = 200. Turnover = 10.
        result = AnalyticsService.calculate_inventory_turnover(self.db, period_days=30)
        
        self.assertEqual(result["cogs"], 2000.0)
        self.assertEqual(result["turnover_ratio"], 10.0)

    def test_slow_moving_stock(self):
        # Setup
        prod = Product(sku="PROD-006", name="Slow Mover", unit_price=20.0)
        self.db.add(prod)
        self.db.commit()
        
        # Sales: Sold only 2 units in last 90 days
        order = SalesOrder(order_number="SO-4", customer_id=1, warehouse_id=1, status="DELIVERED", order_date=datetime.now() - timedelta(days=50), created_at=datetime.now() - timedelta(days=50))
        self.db.add(order)
        self.db.commit()
        item = SalesOrderItem(sales_order_id=order.id, product_id=prod.id, ordered_qty=2, picked_qty=2)
        self.db.add(item)
        
        # Inventory exists
        inv = Inventory(product_id=prod.id, shelf_id=1, warehouse_id=1, quantity=100)
        self.db.add(inv)
        self.db.commit()
        
        # Detect with max_sales=5
        slow = AnalyticsService.detect_slow_moving_stock(self.db, period_days=90, max_sales_qty=5)
        
        self.assertEqual(len(slow), 1)
        self.assertEqual(slow[0]["product_id"], prod.id)
        self.assertEqual(slow[0]["sold_qty_period"], 2)

    def test_action_recommendations(self):
        # Setup 3 products: Expired, Dead, Slow
        
        # 1. Expired
        p1 = Product(sku="PROD-007", name="Expired Milk", unit_price=10)
        self.db.add(p1)
        
        # 2. Dead
        p2 = Product(sku="PROD-008", name="Dead Tech", unit_price=100)
        self.db.add(p2)
        
        # 3. Slow
        p3 = Product(sku="PROD-009", name="Slow Book", unit_price=15)
        self.db.add(p3)
        self.db.commit()
        
        # Expired Receipt (received 20 days ago, shelf life 10 => expired 10 days ago)
        r1 = Receipt(receipt_number="REC-002", received_at=datetime.now() - timedelta(days=20))
        self.db.add(r1)
        self.db.commit()
        ri1 = ReceiptItem(receipt_id=r1.id, product_id=p1.id, received_qty=10)
        self.db.add(ri1)
        inv1 = Inventory(product_id=p1.id, shelf_id=1, warehouse_id=1, quantity=10)
        self.db.add(inv1)
        
        # Dead Stock (last updated 100 days ago)
        inv2 = Inventory(product_id=p2.id, shelf_id=1, warehouse_id=1, quantity=5, created_at=datetime.now() - timedelta(days=100))
        self.db.add(inv2)
        
        # Slow Stock (sold 1 unit in 60 days)
        inv3 = Inventory(product_id=p3.id, shelf_id=1, warehouse_id=1, quantity=50)
        self.db.add(inv3)
        order = SalesOrder(order_number="SO-5", customer_id=1, warehouse_id=1, status="DELIVERED", order_date=datetime.now() - timedelta(days=10), created_at=datetime.now() - timedelta(days=10))
        self.db.add(order)
        self.db.commit()
        si3 = SalesOrderItem(sales_order_id=order.id, product_id=p3.id, ordered_qty=1, picked_qty=1)
        self.db.add(si3)
        self.db.commit()
        
        recs = AnalyticsService.get_action_recommendations(self.db)
        
        # Check results
        exp_rec = next((r for r in recs if r["product_id"] == p1.id), None)
        dead_rec = next((r for r in recs if r["product_id"] == p2.id), None)
        slow_rec = next((r for r in recs if r["product_id"] == p3.id), None)
        
        self.assertIsNotNone(exp_rec)
        self.assertEqual(exp_rec["action"], "Disposal")
        
        self.assertIsNotNone(dead_rec)
        self.assertIn("Return", dead_rec["action"])
        
        self.assertIsNotNone(slow_rec)
        self.assertIn("Bundle", slow_rec["action"])

if __name__ == '__main__':
    unittest.main()
