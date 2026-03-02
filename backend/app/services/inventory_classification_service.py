"""
Service layer for calculating the Dead & Slow-Moving Inventory Classification.
Integrates ProductDemandAnalytics and ReorderPolicy into a severity score.
Automatically classifies items and recommends actions like Bundle or Disposal.
"""

import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy import select, func, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.products import Product
from app.models.inventory import Inventory
from app.models.demand_analytics import ProductDemandAnalytics
from app.models.reorder_policy import ReorderPolicy
from app.models.inventory_health_analytics import (
    InventoryHealthAnalytics,
    HealthClassification,
    RecommendedAction,
)

logger = logging.getLogger(__name__)


class InventoryClassificationService:
    """Service to automatically classify inventory health based on quantitative rules."""

    @staticmethod
    def _calculate_severity(
        days_since_last_sale: int,
        overstock_ratio: float,
        normalized_velocity: float,
        config: dict
    ) -> float:
        """
        Log-scaled Severity Score Formula.
        severity = w1 * log1p(days) + w2 * overstock + w3 * (1 - velocity)
        """
        import math
        
        w1 = config.get("weight_days", 0.4)
        w2 = config.get("weight_overstock", 0.4)
        w3 = config.get("weight_velocity", 0.2)
        
        # log1p safely handles 0 days
        age_component = w1 * math.log1p(days_since_last_sale)
        
        # Overstock is bounded, so this is safe
        overstock_component = w2 * overstock_ratio
        
        # Lack of velocity increases severity
        velocity_component = w3 * (1.0 - normalized_velocity)
        
        score = age_component + overstock_component + velocity_component
        return score

    @staticmethod
    def _determine_action_with_margin(
        classification: HealthClassification,
        unit_price: float,
        cost: float
    ) -> RecommendedAction:
        """
        Calculates margin to override action for SLOW_MOVING products.
        """
        if classification not in (HealthClassification.SLOW_MOVING, "SLOW_MOVING"):
            if classification in (HealthClassification.DEAD, "DEAD"):
                return RecommendedAction.DISPOSAL
            return RecommendedAction.NONE
            
        if unit_price <= 0:
            return RecommendedAction.NONE
            
        margin_ratio = (unit_price - cost) / unit_price
        
        if margin_ratio > 0.4:
            return RecommendedAction.BUNDLE
        elif margin_ratio < 0.2:
            return RecommendedAction.DISPOSAL
            
        return RecommendedAction.NONE

    @staticmethod
    async def compute_inventory_health(
        db: AsyncSession,
        product_id: int,
        config: dict | None = None
    ) -> InventoryHealthAnalytics:
        """
        Compute the health for a single product. 
        Requires ProductDemandAnalytics row to exist if sales happened.
        """
        if not config:
            config = {
                "slow_turnover_threshold": 0.8,
                "dead_days": 180,
                "target_turnover": 2.0,
            }

        today = datetime.now(timezone.utc).date()

        # 1. Lock the row (or insert if not exists)
        stmt = (
            select(InventoryHealthAnalytics)
            .where(InventoryHealthAnalytics.product_id == product_id)
            .with_for_update()
        )
        health_record = (await db.execute(stmt)).scalar_one_or_none()

        if not health_record:
            health_record = InventoryHealthAnalytics(product_id=product_id)
            db.add(health_record)
            await db.flush()

        # 2. Get inventory metrics (available stock and earliest received date)
        inv_stmt = select(
            func.sum(Inventory.available).label("total_available"),
            func.min(Inventory.received_date).label("earliest_received_date")
        ).where(
            Inventory.product_id == product_id,
            Inventory.status == "ACTIVE"
        )
        inv_result = (await db.execute(inv_stmt)).one()
        total_available = float(inv_result.total_available or 0)
        earliest_rec = inv_result.earliest_received_date

        inventory_age_days = 0
        if earliest_rec:
            inventory_age_days = (today - earliest_rec).days
            if inventory_age_days < 0:
                inventory_age_days = 0

        # 3. Get Demand Analytics & Product pricing
        demand_stmt = select(ProductDemandAnalytics).where(
            ProductDemandAnalytics.product_id == product_id
        )
        demand = (await db.execute(demand_stmt)).scalar_one_or_none()
        avg_daily_demand = float(demand.average_daily_demand) if demand else 0.0
        demand_std_dev = float(demand.demand_std_dev) if demand else 0.0

        product_stmt = select(Product).where(Product.id == product_id)
        product = (await db.execute(product_stmt)).scalar_one_or_none()
        unit_price = float(product.unit_price) if product and product.unit_price else 0.0
        # Assume cost is 50% of price if not explicitly tracked just for margin calc logic if cost column is missing
        # In a real system, cost should be pulled from a cost table.
        cost = unit_price * 0.5 

        # Find the last actual shipment date for this product
        from app.models.orders import DeliveryNote, DeliveryNoteItem, SalesOrderItem
        last_shipment_stmt = (
            select(func.max(DeliveryNote.shipped_at))
            .join(DeliveryNoteItem, DeliveryNoteItem.delivery_note_id == DeliveryNote.id)
            .join(SalesOrderItem, DeliveryNoteItem.sales_order_item_id == SalesOrderItem.id)
            .where(
                SalesOrderItem.product_id == product_id,
                DeliveryNote.status == "DELIVERED"
            )
        )
        last_shipped = (await db.execute(last_shipment_stmt)).scalar()
        
        days_since_last_sale = 0
        if last_shipped:
            if last_shipped.tzinfo is None:
                last_shipped = last_shipped.replace(tzinfo=timezone.utc)
            days_since_last_sale = (datetime.now(timezone.utc) - last_shipped).days
        else:
            days_since_last_sale = inventory_age_days
            
        days_since_last_sale = max(0, days_since_last_sale)

        # 4. Calculate Outbound Qty (90 days)
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        outbound_stmt = (
            select(func.coalesce(func.sum(DeliveryNoteItem.shipped_qty), 0))
            .join(DeliveryNote, DeliveryNoteItem.delivery_note_id == DeliveryNote.id)
            .join(SalesOrderItem, DeliveryNoteItem.sales_order_item_id == SalesOrderItem.id)
            .where(
                SalesOrderItem.product_id == product_id,
                DeliveryNote.status == "DELIVERED",
                DeliveryNote.created_at >= cutoff
            )
        )
        outbound_qty = float((await db.execute(outbound_stmt)).scalar() or 0.0)

        # --- V2 METRICS ---
        
        # 4a. Velocity Score
        velocity_score = outbound_qty / max(total_available, 1.0)
        normalized_velocity = min(velocity_score, 1.0)
        
        # 4b. Overstock Ratio
        if avg_daily_demand > 0:
            expected_90_day_demand = max(avg_daily_demand * 90, 1.0)
            overstock_ratio = min(total_available / expected_90_day_demand, 10.0)
        else:
            overstock_ratio = 10.0  # Bounded constant for zero demand
            
        # 4c. Coefficient of Variation (CV)
        if avg_daily_demand > 0:
            cv = demand_std_dev / avg_daily_demand
        else:
            cv = 10.0  # Bounded constant
            
        # --- V2 ALGORITHM ---
        
        severity_score = 0.0
        target_classification = HealthClassification.HEALTHY
        
        # HARD RULE 1: New SKU Protection
        if inventory_age_days < 60:
            target_classification = HealthClassification.HEALTHY
            severity_score = 0.0
            
        # HARD RULE 2: Zero Demand Dead Stock
        elif avg_daily_demand < 0.01 and days_since_last_sale > 90:
            target_classification = HealthClassification.DEAD
            severity_score = 3.0 # Hardcode high severity
            
        else:
            # 5. Calculate Severity Score
            severity_score = InventoryClassificationService._calculate_severity(
                days_since_last_sale=days_since_last_sale,
                overstock_ratio=overstock_ratio,
                normalized_velocity=normalized_velocity,
                config=config,
            )
            
            # Volatility Adjustment
            if avg_daily_demand > 0 and cv > 1.5 and velocity_score > 0:
                severity_score *= 0.8
                
            # Classify based on score
            if severity_score < 1.0:
                target_classification = HealthClassification.HEALTHY
            elif 1.0 <= severity_score < 2.0:
                target_classification = HealthClassification.SLOW_MOVING
            else:
                target_classification = HealthClassification.DEAD
                
        # Margin Action Bias
        action = InventoryClassificationService._determine_action_with_margin(
            classification=target_classification,
            unit_price=unit_price,
            cost=cost,
        )

        # 6. Apply Hysteresis
        current_class = health_record.classification
        count = health_record.consecutive_confirmation_count
        
        if target_classification != current_class:
            count += 1
            if count >= 2:
                health_record.previous_classification = current_class
                health_record.classification = target_classification
                count = 0
        else:
            count = 0  # Reset if it matches current
            
        health_record.consecutive_confirmation_count = count

        # 7. Apply to DB
        health_record.previous_severity_score = health_record.dead_stock_severity_score
        
        health_record.days_since_last_sale = days_since_last_sale
        health_record.inventory_age_days = inventory_age_days
        health_record.dead_stock_severity_score = Decimal(str(round(severity_score, 4)))
        health_record.velocity_score = Decimal(str(round(velocity_score, 4)))
        health_record.normalized_velocity = Decimal(str(round(normalized_velocity, 4)))
        health_record.overstock_ratio = Decimal(str(round(overstock_ratio, 4)))
        health_record.coefficient_of_variation = Decimal(str(round(cv, 4)))
        health_record.recommended_action = action
        health_record.last_evaluated_at = func.now()

        await db.flush()
        return health_record

    @staticmethod
    async def compute_all_inventory_health(db: AsyncSession) -> dict:
        """
        Batch evaluate all active products.
        Returns summary of classifications.
        """
        stmt = select(Product.id).where(Product.status == "ACTIVE")
        product_ids = (await db.execute(stmt)).scalars().all()

        config = {
            "slow_turnover_threshold": 0.8,
            "dead_days": 180,
            "target_turnover": 2.0,
        }

        results = {
            "HEALTHY": 0,
            "SLOW_MOVING": 0,
            "DEAD": 0,
            "total_computed": 0
        }

        for pid in product_ids:
            record = await InventoryClassificationService.compute_inventory_health(db, pid, config)
            # Accessing enum value as string
            class_str = record.classification.value if hasattr(record.classification, 'value') else str(record.classification)
            
            if class_str in results:
                results[class_str] += 1
            else:
                results[class_str] = 1
                
            results["total_computed"] += 1

        return results

    @staticmethod
    async def ensure_inventory_health_records(db: AsyncSession) -> int:
        missing_stmt = (
            select(Product.id)
            .outerjoin(InventoryHealthAnalytics, InventoryHealthAnalytics.product_id == Product.id)
            .where(
                Product.status == "ACTIVE",
                InventoryHealthAnalytics.product_id.is_(None),
            )
        )
        missing_ids = (await db.execute(missing_stmt)).scalars().all()

        invalid_stmt = select(InventoryHealthAnalytics.product_id).where(
            InventoryHealthAnalytics.velocity_score.is_(None)
            | InventoryHealthAnalytics.normalized_velocity.is_(None)
            | InventoryHealthAnalytics.overstock_ratio.is_(None)
            | InventoryHealthAnalytics.coefficient_of_variation.is_(None)
        )
        invalid_ids = (await db.execute(invalid_stmt)).scalars().all()

        to_recompute = list({*missing_ids, *invalid_ids})
        if not to_recompute:
            return 0

        async with db.begin():
            for product_id in to_recompute:
                await InventoryClassificationService.compute_inventory_health(db, product_id)

        return len(to_recompute)

    @staticmethod
    async def get_classification(db: AsyncSession, product_id: int) -> dict | None:
        """
        Retrieve the latest structured classification data for frontend dashboards.
        """
        stmt = select(InventoryHealthAnalytics).where(
            InventoryHealthAnalytics.product_id == product_id
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        
        if not record:
            return None
            
        return {
            "product_id": record.product_id,
            "classification": record.classification.value if hasattr(record.classification, 'value') else str(record.classification),
            "recommended_action": record.recommended_action.value if hasattr(record.recommended_action, 'value') else str(record.recommended_action),
            "severity_score": float(record.dead_stock_severity_score),
            "previous_severity_score": float(record.previous_severity_score) if record.previous_severity_score is not None else float(record.dead_stock_severity_score),
            "days_since_last_sale": record.days_since_last_sale,
            "turnover_ratio": float(record.turnover_ratio),
            "velocity_score": float(record.velocity_score),
            "overstock_ratio": float(record.overstock_ratio),
            "cv": float(record.coefficient_of_variation),
            "inventory_age_days": record.inventory_age_days
        }

    @staticmethod
    async def get_all_classifications(
        db: AsyncSession,
        sort_by: str = "severity_score",
        order: str = "desc"
    ) -> list[dict]:
        """
        Retrieve all classifications with sorting support.
        """
        await InventoryClassificationService.ensure_inventory_health_records(db)
        from app.models.inventory import Inventory
        
        stmt = (
            select(
                InventoryHealthAnalytics, 
                Product.name, 
                Product.sku, 
                Product.unit_price,
                func.coalesce(func.sum(Inventory.available), 0).label("total_available")
            )
            .join(Product, Product.id == InventoryHealthAnalytics.product_id)
            .outerjoin(Inventory, Inventory.product_id == Product.id)
            .group_by(InventoryHealthAnalytics.product_id, Product.id)
        )
        
        if sort_by == "velocity":
            sort_col = InventoryHealthAnalytics.velocity_score
        elif sort_by == "overstock":
            sort_col = InventoryHealthAnalytics.overstock_ratio
        elif sort_by == "capital":
            # Fallback to severity sorting down to DB complexity, capital risk calculated visually in UI
            sort_col = InventoryHealthAnalytics.dead_stock_severity_score
        else:
            sort_col = InventoryHealthAnalytics.dead_stock_severity_score
            
        if order == "asc":
            stmt = stmt.order_by(sort_col.asc())
        else:
            stmt = stmt.order_by(sort_col.desc())
            
        records = (await db.execute(stmt)).all()
        
        return [
            {
                "product_id": r.InventoryHealthAnalytics.product_id,
                "sku": r.sku,
                "name": r.name,
                "unit_price": float(r.unit_price) if r.unit_price else 0.0,
                "total_available": float(r.total_available) if r.total_available else 0.0,
                "classification": r.InventoryHealthAnalytics.classification.value if hasattr(r.InventoryHealthAnalytics.classification, 'value') else str(r.InventoryHealthAnalytics.classification),
                "recommended_action": r.InventoryHealthAnalytics.recommended_action.value if hasattr(r.InventoryHealthAnalytics.recommended_action, 'value') else str(r.InventoryHealthAnalytics.recommended_action),
                "severity_score": float(r.InventoryHealthAnalytics.dead_stock_severity_score),
                "previous_severity_score": float(r.InventoryHealthAnalytics.previous_severity_score) if r.InventoryHealthAnalytics.previous_severity_score is not None else float(r.InventoryHealthAnalytics.dead_stock_severity_score),
                "days_since_last_sale": r.InventoryHealthAnalytics.days_since_last_sale,
                "velocity_score": float(r.InventoryHealthAnalytics.velocity_score),
                "overstock_ratio": float(r.InventoryHealthAnalytics.overstock_ratio),
                "cv": float(r.InventoryHealthAnalytics.coefficient_of_variation),
                "consecutive_confirmation_count": r.InventoryHealthAnalytics.consecutive_confirmation_count
            }
            for r in records
        ]