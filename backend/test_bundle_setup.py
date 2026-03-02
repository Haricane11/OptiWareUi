import asyncio
from datetime import date
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.products import Product
from app.models.customer import Customer
from app.models.warehouse import Warehouse
from app.models.bundle import Bundle, BundleItem, BundleSale
from app.models.orders import SalesOrder, SalesOrderItem
from app.services.sales_service import SalesService
from sqlalchemy import select

async def main():
    # Setup in-memory SQLite (requires async sqlite driver like aiosqlite, assuming it exists since the main app uses it)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as db:
        # Create test data
        warehouse = Warehouse(name="Test Warehouse", location="Test Location")
        customer = Customer(customer_name="Test Customer", email="test@example.com", shipping_address="123 Test St.")
        
        product1 = Product(sku="B-PROD-01", name="Product 1", unit_price=10.0)
        product2 = Product(sku="B-PROD-02", name="Product 2", unit_price=15.0)
        
        db.add_all([warehouse, customer, product1, product2])
        await db.flush()
        
        # Create a Bundle
        bundle = Bundle(bundle_name="Test Bundle", bundle_price=20.0, is_active=True)
        db.add(bundle)
        await db.flush()
        
        bundle_item1 = BundleItem(bundle_id=bundle.id, product_id=product1.id, quantity=1)
        bundle_item2 = BundleItem(bundle_id=bundle.id, product_id=product2.id, quantity=2)
        db.add_all([bundle_item1, bundle_item2])
        await db.commit()
        
        # We need to make sure SalesService.create_order works as modified
        order_number = "TEST-BUNDLE-SO-01"
        items = [
            {
                "product_id": product1.id,
                "ordered_qty": 1,
                "bundle_id": bundle.id,
            }
        ]
        order = await SalesService.create_order(
            db,
            order_number=order_number,
            customer_id=customer.id,
            warehouse_id=warehouse.id,
            items=items,
            priority_level="NORMAL",
        )
        
        # Verify 
        # 1. SalesOrder created
        assert order.id is not None
        print(f"Order created: {order.order_number}")
        
        # 2. BundleSale created
        stmt = select(BundleSale).where(BundleSale.sales_order_id == order.id)
        result = await db.execute(stmt)
        bundle_sales = result.scalars().all()
        
        assert len(bundle_sales) == 1
        print(f"BundleSale created: bundle_id={bundle_sales[0].bundle_id}, quantity={bundle_sales[0].quantity}")
        assert bundle_sales[0].bundle_id == bundle.id
        assert bundle_sales[0].quantity == 2
        
        print("Success! Bundle features run properly.")

if __name__ == "__main__":
    asyncio.run(main())