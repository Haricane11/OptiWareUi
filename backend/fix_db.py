import asyncio
from sqlalchemy import text
from app.core.database import engine

async def main():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TYPE health_type_enum ADD VALUE 'LOW'"))
            print("Successfully added LOW to enum")
        except Exception as e:
            print("Error or already exists:", e)

if __name__ == "__main__":
    asyncio.run(main())
