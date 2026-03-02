"""
Seed realistic and varied health metrics across all products for demo purposes.
Creates a natural distribution: ~60% Healthy, ~25% Slow-Moving, ~15% Dead.
"""
import asyncio
import random
from decimal import Decimal
from sqlalchemy.future import select
from app.core.database import async_session_factory
from app.models.inventory_health_analytics import (
    InventoryHealthAnalytics, 
    HealthClassification, 
    RecommendedAction
)

random.seed(42)  # Reproducible

async def seed_varied_metrics():
    async with async_session_factory() as db:
        try:
            stmt = select(InventoryHealthAnalytics)
            result = await db.execute(stmt)
            records = result.scalars().all()
            
            total = len(records)
            print(f"Found {total} health records to update")
            
            # Shuffle to randomize assignment
            indices = list(range(total))
            random.shuffle(indices)
            
            # Distribution: 60% Healthy, 25% Slow, 15% Dead
            healthy_count = int(total * 0.60)
            slow_count = int(total * 0.25)
            # dead_count = remaining
            
            healthy_ids = set(indices[:healthy_count])
            slow_ids = set(indices[healthy_count:healthy_count + slow_count])
            # dead_ids = everything else
            
            updated = {"HEALTHY": 0, "SLOW_MOVING": 0, "DEAD": 0}
            
            for idx, record in enumerate(records):
                if idx in healthy_ids:
                    # HEALTHY: severity < 1.0, good velocity, low overstock
                    sev = round(random.uniform(0.05, 0.90), 4)
                    vel = round(random.uniform(0.45, 1.0), 4)
                    os_ratio = round(random.uniform(0.2, 2.5), 4)
                    cv = round(random.uniform(0.05, 0.8), 4)
                    days = random.randint(1, 30)
                    classification = HealthClassification.HEALTHY
                    action = RecommendedAction.NONE
                    updated["HEALTHY"] += 1
                    
                elif idx in slow_ids:
                    # SLOW_MOVING: severity 1.0-2.0, moderate velocity, moderate overstock
                    sev = round(random.uniform(1.0, 1.95), 4)
                    vel = round(random.uniform(0.05, 0.45), 4)
                    os_ratio = round(random.uniform(2.5, 6.0), 4)
                    cv = round(random.uniform(0.3, 1.5), 4)
                    days = random.randint(30, 90)
                    classification = HealthClassification.SLOW_MOVING
                    # Margin-based action
                    action = random.choice([RecommendedAction.BUNDLE, RecommendedAction.DISPOSAL, RecommendedAction.NONE])
                    updated["SLOW_MOVING"] += 1
                    
                else:
                    # DEAD: severity >= 2.0, zero/low velocity, high overstock
                    sev = round(random.uniform(2.0, 6.5), 4)
                    vel = round(random.uniform(0.0, 0.05), 4)
                    os_ratio = round(random.uniform(6.0, 10.0), 4)
                    cv = round(random.uniform(1.0, 10.0), 4)
                    days = random.randint(90, 500)
                    classification = HealthClassification.DEAD
                    action = RecommendedAction.DISPOSAL
                    updated["DEAD"] += 1
                
                # Apply varied previous severity (slight delta for trend arrows)
                prev_sev = round(sev + random.uniform(-0.3, 0.3), 4)
                prev_sev = max(0, prev_sev)
                
                # Stabilizing: ~5% of products get confirmation_count = 1
                conf_count = 0
                prev_class = None
                if random.random() < 0.05:
                    conf_count = 1
                    # Previous classification is different
                    if classification == HealthClassification.HEALTHY:
                        prev_class = HealthClassification.SLOW_MOVING
                    elif classification == HealthClassification.SLOW_MOVING:
                        prev_class = random.choice([HealthClassification.HEALTHY, HealthClassification.DEAD])
                    else:
                        prev_class = HealthClassification.SLOW_MOVING
                
                record.classification = classification
                record.dead_stock_severity_score = Decimal(str(sev))
                record.previous_severity_score = Decimal(str(prev_sev))
                record.velocity_score = Decimal(str(vel))
                record.normalized_velocity = Decimal(str(min(vel, 1.0)))
                record.overstock_ratio = Decimal(str(os_ratio))
                record.coefficient_of_variation = Decimal(str(cv))
                record.days_since_last_sale = days
                record.recommended_action = action
                record.consecutive_confirmation_count = conf_count
                if prev_class:
                    record.previous_classification = prev_class
            
            await db.commit()
            
            print(f"\nSeeded metrics successfully!")
            print(f"  HEALTHY:     {updated['HEALTHY']}")
            print(f"  SLOW_MOVING: {updated['SLOW_MOVING']}")
            print(f"  DEAD:        {updated['DEAD']}")
            print(f"  Total:       {sum(updated.values())}")
            
        except Exception as e:
            import traceback
            print(f"Error: {e}")
            traceback.print_exc()
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(seed_varied_metrics())
