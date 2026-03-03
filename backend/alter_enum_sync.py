from sqlalchemy import create_engine, text
import os
import sys

# use synchronous engine for simple DDL
url = "postgresql+psycopg2://wms_user:root123@127.0.0.1:5433/wms"
engine = create_engine(url, isolation_level="AUTOCOMMIT")

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TYPE recommended_action_enum ADD VALUE 'DISCOUNT';"))
        print("Successfully added DISCOUNT.")
    except Exception as e:
        print(f"Error (maybe already exists?): {e}")

    res = conn.execute(text("SELECT enumlabel FROM pg_enum WHERE enumtypid = 'recommended_action_enum'::regtype;"))
    print("Enum values:")
    for row in res:
        print(row[0])
