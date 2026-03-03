import asyncio
from sqlalchemy import text
from app.core.database import async_session_factory

async def run():
    try:
        async with async_session_factory() as db:
            async with db.begin():
                print("Adding column expected_delivery_date to sales_orders if not exists...")
                await db.execute(text("ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;"))
                print("Success!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(run())
