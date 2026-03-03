import asyncio
from sqlalchemy import text
from app.core.database import async_session_factory

async def fix_enum():
    try:
        async with async_session_factory() as db:
            # We must run ALTER TYPE outside of a transaction block or disable autocommit
            # In asyncpg, we can just execute the raw text. Some CREATE/ALTER require isolation level AUTOCOMMIT
            await db.execute(text("COMMIT"))
            await db.execute(text("ALTER TYPE recommended_action_enum ADD VALUE IF NOT EXISTS 'DISCOUNT'"))
            print("Enum DISCOUNT added.")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(fix_enum())
