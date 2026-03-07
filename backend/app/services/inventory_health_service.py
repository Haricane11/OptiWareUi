"""
Inventory Health Service — Detection engine for dead, slow-moving, and expiry-risk stock.

Uses aggregated SQL queries with no N+1. Designed to scale to 100k+ SKUs.
All detection methods return lists of InventoryHealthStatus ORM objects ready for persistence.
"""

import logging
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal

from sqlalchemy import select, func, case, and_, or_, literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory import Inventory
from app.models.products import Product
from app.models.orders import SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem
from app.models.receipt import Receipt, ReceiptItem
from app.models.supplier import Supplier
from app.models.reorder_policy import ReorderPolicy
from app.models.inventory_health import (
    InventoryHealthStatus,
    InventoryActionSuggestion,
    InventoryOptimizationConfig,
    HealthType,
    SuggestionType,
    SuggestionStatus,
)

logger = logging.getLogger(__name__)


class InventoryHealthService:
    """Core detection engine for inventory health issues."""

    # ── Configuration ─────────────────────────────────────────────────

    @staticmethod
    async def get_or_create_config(db: AsyncSession) -> InventoryOptimizationConfig:
        """Load or create the singleton config row."""
        stmt = select(InventoryOptimizationConfig).where(
            InventoryOptimizationConfig.id == 1
        )
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()
        if not config:
            config = InventoryOptimizationConfig(id=1)
            db.add(config)
            await db.flush()
        return config

    @staticmethod
    async def update_config(
        db: AsyncSession, updates: dict
    ) -> InventoryOptimizationConfig:
        """Partially update config fields."""
        config = await InventoryHealthService.get_or_create_config(db)
        for key, value in updates.items():
            if value is not None and hasattr(config, key):
                setattr(config, key, value)
        await db.flush()
        return config

    # (detect_dead_stock and detect_slow_moving have been removed. 
    #  Logic is now unified under InventoryClassificationService.)

    # ── Expiry Risk Detection ─────────────────────────────────────────

    @staticmethod
    async def detect_expiry_risk(
        db: AsyncSession,
        config: InventoryOptimizationConfig,
    ) -> list[InventoryHealthStatus]:
        """
        Near-expiry: expiry_date - today <= expiry_warning_days.
        Expired: expiry_date < today.
        Severity = 100 - (days_to_expiry × 2), clamped to [0, 100].
        Already expired → severity = 100.
        """
        warning_days = int(config.expiry_warning_days)
        today_date = date.today()
        cutoff = today_date + timedelta(days=warning_days)

        stmt = (
            select(Inventory, Product)
            .join(Product, Inventory.product_id == Product.id)
            .where(
                Inventory.status == "ACTIVE",
                Inventory.quantity > 0,
                Inventory.expiry_date.isnot(None),
                Inventory.expiry_date <= cutoff,
            )
            .order_by(Inventory.expiry_date.asc())
        )

        result = await db.execute(stmt)
        rows = result.all()

        health_records = []

        for inv, prod in rows:
            days_to_expiry = (inv.expiry_date - today_date).days
            is_expired = days_to_expiry < 0

            if is_expired:
                severity = 100.0
            else:
                severity = min(100.0, max(0.0, 100 - (days_to_expiry * 2)))

            cost = float(prod.unit_price) if prod.unit_price else 0.0

            health_records.append(
                InventoryHealthStatus(
                    product_id=inv.product_id,
                    warehouse_id=inv.warehouse_id,
                    batch_id=inv.id,
                    health_type=HealthType.EXPIRY,
                    severity_score=Decimal(str(round(severity, 2))),
                    details={
                        "days_to_expiry": days_to_expiry,
                        "is_expired": is_expired,
                        "expiry_date": str(inv.expiry_date),
                        "batch_number": inv.batch_number,
                        "quantity": inv.quantity,
                        "potential_loss": round(inv.quantity * cost, 2),
                    },
                )
            )

        logger.info("Expiry scan: %d issues detected", len(health_records))
        return health_records

    # ── Low Stock Detection ───────────────────────────────────────────

    @staticmethod
    async def detect_low_stock(
        db: AsyncSession,
        config: InventoryOptimizationConfig,
    ) -> list[InventoryHealthStatus]:
        """
        Low stock = total available quantity < reorder_point from ReorderPolicy.
        Severity = min(100, (1 - available/reorder_point) * 100).
        Only considers products that DO have a reorder policy set.
        """
        avail_subq = (
            func.coalesce(
                select(func.sum(Inventory.available))
                .where(
                    Inventory.product_id == Product.id,
                    Inventory.status == "ACTIVE",
                )
                .correlate(Product)
                .scalar_subquery(),
                0,
            )
        )

        wh_subq = (
            func.coalesce(
                select(func.max(Inventory.warehouse_id))
                .where(Inventory.product_id == Product.id)
                .correlate(Product)
                .scalar_subquery(),
                1,
            )
        )

        stmt = (
            select(
                Product.id.label("product_id"),
                wh_subq.label("warehouse_id"),
                avail_subq.label("total_available"),
                ReorderPolicy.reorder_point,
                Product.unit_price.label("unit_price"),
            )
            .join(ReorderPolicy, Product.id == ReorderPolicy.product_id)
            .where(
                ReorderPolicy.reorder_point.isnot(None),
                ReorderPolicy.reorder_point > 0,
                func.coalesce(avail_subq, 0) <= ReorderPolicy.reorder_point,
            )
        )

        result = await db.execute(stmt)
        rows = result.all()

        health_records = []

        for row in rows:
            total_avail = float(row.total_available)
            rop = float(row.reorder_point)
            cost = float(row.unit_price) if row.unit_price else 0.0
            deficit = rop - total_avail
            severity = min(100.0, max(0.0, (deficit / rop) * 100))

            health_records.append(
                InventoryHealthStatus(
                    product_id=row.product_id,
                    warehouse_id=row.warehouse_id,
                    health_type=HealthType.LOW,
                    severity_score=Decimal(str(round(severity, 2))),
                    details={
                        "total_available": total_avail,
                        "reorder_point": rop,
                        "deficit": round(deficit, 2),
                        "potential_loss": round(deficit * cost, 2),
                    },
                )
            )

        logger.info("Low stock scan: %d issues detected", len(health_records))
        return health_records

    # ── Resolve old statuses ──────────────────────────────────────────

    @staticmethod
    async def resolve_old_statuses(db: AsyncSession) -> int:
        """Mark all unresolved health statuses as resolved (before re-scan)."""
        from sqlalchemy import update

        stmt = (
            update(InventoryHealthStatus)
            .where(InventoryHealthStatus.resolved_at.is_(None))
            .values(resolved_at=func.now())
        )
        result = await db.execute(stmt)
        return result.rowcount

    # ── Persist health statuses ───────────────────────────────────────

    @staticmethod
    async def persist_statuses(
        db: AsyncSession, statuses: list[InventoryHealthStatus]
    ) -> list[InventoryHealthStatus]:
        """Bulk-add health statuses to the session."""
        for s in statuses:
            db.add(s)
        await db.flush()
        return statuses

    # ── Health Report ─────────────────────────────────────────────────

    @staticmethod
    async def get_health_report(db: AsyncSession) -> dict:
        """Aggregated health report from unified analytics + status."""
        from sqlalchemy.orm import selectinload
        from app.models.products import Product
        from app.models.inventory import Inventory
        from app.models.inventory_health_analytics import InventoryHealthAnalytics, HealthClassification
        
        # 1. Load active legacy statuses (EXPIRY, LOW)
        stmt_status = (
            select(InventoryHealthStatus)
            .where(
                InventoryHealthStatus.resolved_at.is_(None),
                InventoryHealthStatus.health_type.in_([HealthType.EXPIRY, HealthType.LOW])
            )
            .options(
                selectinload(InventoryHealthStatus.product).selectinload(Product.reorder_policy),
                selectinload(InventoryHealthStatus.product).selectinload(Product.inventory_items).selectinload(Inventory.shelf),
                selectinload(InventoryHealthStatus.batch).selectinload(Inventory.shelf)
            )
            .order_by(InventoryHealthStatus.severity_score.desc())
        )
        result_status = await db.execute(stmt_status)
        all_statuses = result_status.scalars().all()

        expiry = [s for s in all_statuses if s.health_type == HealthType.EXPIRY]
        low = [s for s in all_statuses if s.health_type == HealthType.LOW]

        # 2. Load unified analytics (DEAD, SLOW)
        stmt_analytics = (
            select(InventoryHealthAnalytics, Product)
            .join(Product, Product.id == InventoryHealthAnalytics.product_id)
            .options(
                selectinload(Product.reorder_policy),
                selectinload(Product.inventory_items).selectinload(Inventory.shelf)
            )
            .where(
                InventoryHealthAnalytics.classification.in_([
                    HealthClassification.DEAD, 
                    HealthClassification.DORMANT,
                    HealthClassification.SLOW_MOVING
                ])
            )
            .order_by(InventoryHealthAnalytics.dead_stock_severity_score.desc())
        )
        result_analytics = await db.execute(stmt_analytics)
        analytics_rows = result_analytics.all()

        class DummyStatus:
            pass

        dead = []
        dormant = []
        slow = []
        total_value = 0.0

        for s in all_statuses:
            if s.details:
                total_value += s.details.get("potential_loss", 0.0)
            
            # Map dynamic UI fields for HealthStatusItem schema
            s.product_name = s.product.name if s.product else "Unknown"
            s.sku = s.product.sku if s.product else "Unknown"
            s.min_qty = s.product.reorder_policy.reorder_point if (s.product and s.product.reorder_policy) else 0
            
            # Prefer details['total_available'], then calculate from inventory, then fallback to batch quantity
            if s.details and "total_available" in s.details:
                s.current_qty = s.details["total_available"]
            else:
                s.current_qty = sum([float(inv.available) for inv in s.product.inventory_items if inv.status == "ACTIVE"]) if s.product else 0
                
            # If batch exists, it usually means it's an EXPIRY risk specific to one batch
            if s.batch and s.health_type == HealthType.EXPIRY:
                s.shelf_code = s.batch.shelf.shelf_code if s.batch.shelf else "Unknown"
                s.current_qty = s.batch.quantity # Replace with exact batch quantity for expiry
            else:
                # Aggregate shelves for low stock
                if s.product and s.product.inventory_items:
                    shelves = [inv.shelf.shelf_code for inv in s.product.inventory_items if inv.shelf and inv.quantity > 0]
                    unique_shelves = list(dict.fromkeys(shelves)) # preserve order, remove duplicates
                    if len(unique_shelves) > 2:
                        s.shelf_code = f"{unique_shelves[0]}, {unique_shelves[1]} +{len(unique_shelves)-2} more"
                    elif unique_shelves:
                        s.shelf_code = ", ".join(unique_shelves)
                    else:
                        s.shelf_code = "Unassigned"
                else:
                    s.shelf_code = "Unassigned"

        # Map Analytics to DummyStatus for UI compatibility
        for an, prod in analytics_rows:
            ds = DummyStatus()
            ds.id = an.product_id
            ds.product_id = an.product_id
            ds.warehouse_id = 1
            ds.batch_id = None
            ds.health_type = HealthType.DEAD if an.classification == HealthClassification.DEAD else (
                HealthType.DORMANT if an.classification == HealthClassification.DORMANT else HealthType.SLOW
            )
            ds.severity_score = float(an.dead_stock_severity_score)
            ds.detected_at = an.last_evaluated_at
            ds.resolved_at = None
            
            # Additional V2 details
            ds.details = {
                "velocity_score": float(an.velocity_score),
                "overstock_ratio": float(an.overstock_ratio),
                "cv": float(an.coefficient_of_variation),
                "recommended_action": an.recommended_action.value if hasattr(an.recommended_action, 'value') else str(an.recommended_action),
                "days_without_sale": an.days_since_last_sale
            }
            
            # Common UI Fields
            ds.product_name = prod.name
            ds.sku = prod.sku
            ds.min_qty = prod.reorder_policy.reorder_point if prod.reorder_policy else 0
            
            total_available = sum([float(inv.available) for inv in prod.inventory_items if inv.status == "ACTIVE"])
            ds.current_qty = total_available
            
            # Value at risk using unified model cost
            cost = float(prod.cost) if hasattr(prod, 'cost') and prod.cost else (float(prod.unit_price) * 0.6 if prod.unit_price else 0)
            potential_loss = total_available * cost
            ds.details["potential_loss"] = potential_loss
            total_value += potential_loss

            if prod.inventory_items:
                shelves = [inv.shelf.shelf_code for inv in prod.inventory_items if inv.shelf and inv.quantity > 0]
                unique_shelves = list(dict.fromkeys(shelves))
                if len(unique_shelves) > 2:
                    ds.shelf_code = f"{unique_shelves[0]}, {unique_shelves[1]} +{len(unique_shelves)-2} more"
                elif unique_shelves:
                    ds.shelf_code = ", ".join(unique_shelves)
                else:
                    ds.shelf_code = "Unassigned"
            else:
                ds.shelf_code = "Unassigned"
                
            if ds.health_type == HealthType.DEAD:
                dead.append(ds)
            elif ds.health_type == HealthType.DORMANT:
                dormant.append(ds)
            else:
                slow.append(ds)

        return {
            "total_issues": len(dead) + len(dormant) + len(slow) + len(expiry) + len(low),
            "dead_stock_count": len(dead),
            "dormant_count": len(dormant),
            "slow_moving_count": len(slow),
            "expiry_risk_count": len(expiry),
            "low_stock_count": len(low),
            "total_value_at_risk": round(total_value, 2),
            "dead_stock_items": dead,
            "dormant_items": dormant,
            "slow_moving_items": slow,
            "expiry_risk_items": expiry,
            "low_stock_items": low,
        }

    # ── Get Suggestions ───────────────────────────────────────────────

    @staticmethod
    async def get_suggestions(
        db: AsyncSession,
        status_filter: str | None = None,
        type_filter: str | None = None,
        search_query: str | None = None,
        limit: int = 50,
        skip: int = 0,
    ) -> tuple[list, int]:
        """
        List action suggestions with optional filtering, pagination, and
        enriched product_name/estimated_value/health_status fields.
        Returns (items, total_count).
        """
        from sqlalchemy import func as sqlfunc
        from app.models.products import Product as ProductModel

        base_stmt = (
            select(InventoryActionSuggestion)
            .join(ProductModel, InventoryActionSuggestion.product_id == ProductModel.id)
            .options(
                selectinload(InventoryActionSuggestion.product),
                selectinload(InventoryActionSuggestion.health_status),
            )
            .order_by(
                InventoryActionSuggestion.severity_score.desc(),
                InventoryActionSuggestion.created_at.desc(),
                InventoryActionSuggestion.id.desc(),
            )
        )

        if status_filter:
            base_stmt = base_stmt.where(
                InventoryActionSuggestion.status == SuggestionStatus(status_filter)
            )
        if type_filter:
            base_stmt = base_stmt.where(
                InventoryActionSuggestion.suggestion_type == SuggestionType(type_filter)
            )
        if search_query:
            from sqlalchemy import or_
            base_stmt = base_stmt.where(
                or_(
                    ProductModel.name.ilike(f"%{search_query}%"),
                    ProductModel.sku.ilike(f"%{search_query}%"),
                    InventoryActionSuggestion.reasoning.ilike(f"%{search_query}%")
                )
            )

        # Count
        count_stmt = select(sqlfunc.count()).select_from(base_stmt.subquery())
        total = (await db.execute(count_stmt)).scalar_one()

        # Paginated
        paged_stmt = base_stmt.offset(skip).limit(limit)
        result = await db.execute(paged_stmt)
        suggestions = list(result.scalars().all())

        # Enrich with display fields
        for s in suggestions:
            s.product_name = s.product.name if s.product else "Unknown"
            s.sku = s.product.sku if s.product else "Unknown"
            # Estimate value from severity + details in health_status
            if s.health_status and s.health_status.details:
                s.estimated_value = float(s.health_status.details.get("potential_loss", 0.0))
            else:
                s.estimated_value = 0.0
            # Map health type
            if s.health_status:
                ht = s.health_status.health_type
                days = None
                if s.health_status.details:
                    days = s.health_status.details.get("days_without_sale") or s.health_status.details.get("days_to_expiry")
                s.health_status_label = str(ht.value) if ht else None
                s.health_days = days
            else:
                s.health_status_label = None
                s.health_days = None

        return suggestions, total
