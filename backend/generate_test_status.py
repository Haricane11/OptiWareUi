import asyncio
import random
from decimal import Decimal
import os
import sys

# Ensure this script runs perfectly regardless of CWD by setting import paths
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.future import select
from sqlalchemy import text
from app.core.database import async_session_factory
from app.models.inventory_health_analytics import (
    InventoryHealthAnalytics, 
    HealthClassification, 
    RecommendedAction
)

random.seed(42)

async def seed_varied_metrics():
    # Attempt to ALTER TYPE if using postgres
    try:
        from app.core.database import engine
        if engine.url.get_backend_name() == "postgresql":
            # Using raw connection for ALTER TYPE
            async with engine.connect() as conn:
                try:
                    await conn.execution_options(isolation_level="AUTOCOMMIT").execute(
                        text("ALTER TYPE recommended_action_enum ADD VALUE IF NOT EXISTS 'DISCOUNT'")
                    )
                    print("Successfully added DISCOUNT to Postgres Enum.")
                except Exception as e:
                    print(f"Enum already exists or could not be altered: {e}")
    except Exception as e:
        print(f"Could not alter enum type: {e}")

    async with async_session_factory() as db:
        try:
            stmt = select(InventoryHealthAnalytics)
            result = await db.execute(stmt)
            records = result.scalars().all()
            
            total = len(records)
            print(f"Found {total} health records to update")
            
            if total < 20:
                print("Not enough records to seed 20 specific cases.")
                return

            # Keep 60% Healthy
            healthy_count = int(total * 0.60)
            indices = list(range(total))
            random.shuffle(indices)
            
            healthy_ids = set(indices[:healthy_count])
            
            # The rest are slow/dead. Let's make sure we have exactly 10 Slow-Moving DISCOUNT and 10 DEAD BUNDLE
            # to verify backend executes these properly.
            
            discount_targets = indices[healthy_count:healthy_count+10]
            bundle_targets = indices[healthy_count+10:healthy_count+20]
            other_ids = set(indices[healthy_count+20:])
            
            updated = {"HEALTHY": 0, "SLOW_MOVING": 0, "DEAD": 0}
            
            for idx, record in enumerate(records):
                if idx in healthy_ids:
                    # HEALTHY: severity < 1.0
                    sev = round(random.uniform(0.05, 0.90), 4)
                    vel = round(random.uniform(0.45, 1.0), 4)
                    os_ratio = round(random.uniform(0.2, 2.5), 4)
                    cv = round(random.uniform(0.05, 0.8), 4)
                    days = random.randint(1, 30)
                    classification = HealthClassification.HEALTHY
                    action = RecommendedAction.NONE
                    updated["HEALTHY"] += 1
                elif idx in discount_targets:
                    # SLOW_MOVING - expected BUNDLE/DISCOUNT
                    sev = round(random.uniform(1.0, 1.95), 4)
                    vel = round(random.uniform(0.05, 0.45), 4)
                    os_ratio = round(random.uniform(2.5, 6.0), 4)
                    cv = round(random.uniform(0.3, 1.5), 4)
                    days = random.randint(30, 90)
                    classification = HealthClassification.SLOW_MOVING
                    action = RecommendedAction.DISCOUNT
                    updated["SLOW_MOVING"] += 1
                elif idx in bundle_targets:
                    # Actually BUNDLE is usually for SLOW_MOVING with high margin
                    # Let's assign these as SLOW_MOVING + BUNDLE
                    sev = round(random.uniform(1.0, 1.95), 4)
                    vel = round(random.uniform(0.05, 0.45), 4)
                    os_ratio = round(random.uniform(2.5, 6.0), 4)
                    cv = round(random.uniform(0.3, 1.5), 4)
                    days = random.randint(30, 90)
                    classification = HealthClassification.SLOW_MOVING
                    action = RecommendedAction.BUNDLE
                    updated["SLOW_MOVING"] += 1
                else:
                    # Random DEAD / SLOW
                    if random.random() > 0.5:
                        sev = round(random.uniform(2.0, 6.5), 4)
                        vel = round(random.uniform(0.0, 0.05), 4)
                        os_ratio = round(random.uniform(6.0, 10.0), 4)
                        cv = round(random.uniform(1.0, 10.0), 4)
                        days = random.randint(90, 500)
                        classification = HealthClassification.DEAD
                        action = RecommendedAction.DISPOSAL
                        updated["DEAD"] += 1
                    else:
                        sev = round(random.uniform(1.0, 1.95), 4)
                        vel = round(random.uniform(0.05, 0.45), 4)
                        os_ratio = round(random.uniform(2.5, 6.0), 4)
                        cv = round(random.uniform(0.3, 1.5), 4)
                        days = random.randint(30, 90)
                        classification = HealthClassification.SLOW_MOVING
                        action = RecommendedAction.DISPOSAL
                        updated["SLOW_MOVING"] += 1

                record.classification = classification
                record.dead_stock_severity_score = Decimal(str(sev))
                record.previous_severity_score = Decimal(str(max(0, sev + random.uniform(-0.3, 0.3))))
                record.velocity_score = Decimal(str(vel))
                record.normalized_velocity = Decimal(str(min(vel, 1.0)))
                record.overstock_ratio = Decimal(str(os_ratio))
                record.coefficient_of_variation = Decimal(str(cv))
                record.days_since_last_sale = days
                
                # Assign action if valid enum value in DB
                # Actually during script run, enum might not be ready if sync fails, but we'll try!
                try:
                    record.recommended_action = action
                except Exception:
                    # Fallback to NONE if DB throws error or Python throws error
                    pass
                
                record.consecutive_confirmation_count = 0
            
            await db.commit()
            print("Successfully seeded requested data points:")
            print(f"  HEALTHY: {updated['HEALTHY']}")
            print(f"  SLOW: {updated['SLOW_MOVING']} (includes 10 DISCOUNT + 10 BUNDLE)")
            print(f"  DEAD: {updated['DEAD']}")
            
        except Exception as e:
            import traceback
            print(f"Error: {e}")
            traceback.print_exc()
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(seed_varied_metrics())
