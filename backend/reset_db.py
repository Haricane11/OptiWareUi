"""Drop schema public cascade and recreate it."""
import asyncio
from sqlalchemy import text
from app.core.database import engine, Base
from app.models import *  # noqa

async def reset_db():
    print("Dropping schema public CASCADE...")
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE;"))
        await conn.execute(text("CREATE SCHEMA public;"))
        
    print("Creating all tables from metadata...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    print("DB reset complete.")

if __name__ == "__main__":
    asyncio.run(reset_db())
