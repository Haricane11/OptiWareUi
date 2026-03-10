import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def fix_types():
    url = os.getenv("DATABASE_URL")
    url = url.replace("postgresql+psycopg2://", "postgresql://")
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    
    print(f"Connecting to raw PG: {url}")
    conn = await asyncpg.connect(url)
    try:
        # 1. Drop the default value first
        print("Dropping default for turnover_rate...")
        await conn.execute("ALTER TABLE products ALTER COLUMN turnover_rate DROP DEFAULT")
        
        # 2. Clean data
        print("Cleaning non-numeric data in products.turnover_rate...")
        await conn.execute("""
            UPDATE products 
            SET turnover_rate = NULL 
            WHERE turnover_rate IS NOT NULL 
              AND trim(turnover_rate) NOT SIMILAR TO '[0-9]+(\.[0-9]+)?';
        """)
        
        # 3. Migrate type
        print("Migrating products.turnover_rate from VARCHAR to NUMERIC...")
        await conn.execute("""
            ALTER TABLE products 
            ALTER COLUMN turnover_rate TYPE NUMERIC(10, 2) 
            USING CASE 
                WHEN turnover_rate IS NULL OR trim(turnover_rate) = '' THEN NULL 
                ELSE trim(turnover_rate)::NUMERIC 
            END;
        """)
        
        # 4. Re-set default as a numeric 0
        print("Setting new numeric default for turnover_rate...")
        await conn.execute("ALTER TABLE products ALTER COLUMN turnover_rate SET DEFAULT 0")
        
        print("Migration SUCCESSful.")
        
        res = await conn.fetchrow("""
            SELECT column_name, udt_name, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'turnover_rate'
        """)
        print(f"Final state: {res}")
        
    except Exception as e:
        print(f"FAILED with: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(fix_types())
