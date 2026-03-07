import asyncio
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
from app.core.database import async_session_factory
from sqlalchemy import text

async def check():
    async with async_session_factory() as db:
        res = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='inventory_health_analytics'"))
        cols = [r[0] for r in res.all()]
        print("Columns:", cols)
        
        if "consecutive_confirmation_count" not in cols:
            print("\nExecuting ALTER TABLE")
            await db.execute(text("ALTER TABLE inventory_health_analytics ADD COLUMN previous_classification health_classification_enum"))
            await db.execute(text("ALTER TABLE inventory_health_analytics ADD COLUMN consecutive_confirmation_count INTEGER NOT NULL DEFAULT 0"))
            await db.commit()
            print("Added missing columns.")
        else:
            print("Columns already exist.")

asyncio.run(check())
