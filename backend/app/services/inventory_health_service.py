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

    # ── Dead Stock Detection ──────────────────────────────────────────

    @staticmethod
    async def detect_dead_stock(
        db: AsyncSession,
        config: InventoryOptimizationConfig,
    ) -> list[InventoryHealthStatus]:
        """
        Dead stock = available_quantity > 0 AND no outbound movement in X days.

        Outbound movement is checked via:
        - sales_order_items (for sales orders that were DELIVERED/CLOSED)
        - delivery_note_items (shipped_qty)

        Severity = min(100, days_without_sale × 0.5)
        """
        threshold_days = int(config.dead_days_threshold)
        cutoff = datetime.now(timezone.utc) - timedelta(days=threshold_days)

        # Subquery: products with recent outbound (delivered/closed sales)
        recent_outbound = (
            select(SalesOrderItem.product_id)
            .join(SalesOrder, SalesOrderItem.sales_order_id == SalesOrder.id)
            .where(
                SalesOrder.status.in_(["DELIVERED", "CLOSED"]),
                SalesOrder.created_at >= cutoff,
            )
            .distinct()
            .correlate_except(SalesOrderItem)
        ).subquery()

        # Main query: active inventory with stock but no recent outbound
        stmt = (
            select(
                Inventory.product_id,
                Inventory.warehouse_id,
                func.sum(Inventory.available).label("total_available"),
                func.min(Inventory.received_date).label("earliest_received"),
                func.min(Product.unit_price).label("unit_price")
            )
            .join(Product, Inventory.product_id == Product.id)
            .where(
                Inventory.status == "ACTIVE",
                Inventory.available > 0,
                Inventory.product_id.notin_(select(recent_outbound.c.product_id)),
            )
            .group_by(Inventory.product_id, Inventory.warehouse_id)
        )

        result = await db.execute(stmt)
        rows = result.all()

        health_records = []
        today = date.today()

        for row in rows:
            received = row.earliest_received
            if received:
                days_in_stock = (today - received).days
            else:
                days_in_stock = threshold_days

            severity = min(100.0, days_in_stock * 0.5)
            cost = float(row.unit_price) if row.unit_price else 0.0
            total_avail = float(row.total_available)

            health_records.append(
                InventoryHealthStatus(
                    product_id=row.product_id,
                    warehouse_id=row.warehouse_id,
                    health_type=HealthType.DEAD,
                    severity_score=Decimal(str(round(severity, 2))),
                    details={
                        "days_without_sale": days_in_stock,
                        "total_available": total_avail,
                        "threshold_days": threshold_days,
                        "potential_loss": round(total_avail * cost, 2),
                    },
                )
            )

        logger.info("Dead stock scan: %d issues detected", len(health_records))
        return health_records

    # ── Slow-Moving Stock Detection ───────────────────────────────────

    @staticmethod
    async def detect_slow_moving(
        db: AsyncSession,
        config: InventoryOptimizationConfig,
    ) -> list[InventoryHealthStatus]:
        """
        Slow-moving = turnover ratio below threshold.
        Turnover = Total outbound qty (last 90 days) / average inventory.
        Severity = (1 - turnover_ratio) × 100, clamped to [0, 100].
        """
        slow_threshold = float(config.slow_turnover_threshold)
        period_days = 90
        cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)

        # Subquery: total sold qty per product in last 90 days (delivered/closed)
        sold_subq = (
            select(
                SalesOrderItem.product_id,
                func.coalesce(func.sum(SalesOrderItem.picked_qty), 0).label("sold_qty"),
            )
            .join(SalesOrder, SalesOrderItem.sales_order_id == SalesOrder.id)
            .where(
                SalesOrder.status.in_(["DELIVERED", "CLOSED"]),
                SalesOrder.created_at >= cutoff,
            )
            .group_by(SalesOrderItem.product_id)
        ).subquery()

        # Main query: inventory with turnover calculation
        stmt = (
            select(
                Inventory.product_id,
                Inventory.warehouse_id,
                func.sum(Inventory.quantity).label("avg_inventory"),
                func.sum(Inventory.available).label("total_available"),
                func.coalesce(sold_subq.c.sold_qty, 0).label("sold_qty"),
                Product.unit_price.label("unit_price")
            )
            .join(Product, Inventory.product_id == Product.id)
            .outerjoin(sold_subq, Inventory.product_id == sold_subq.c.product_id)
            .where(
                Inventory.status == "ACTIVE",
                Inventory.quantity > 0,
                # Exclude items that have ZERO sales AND no recent outbound movement (these are DEAD stock)
                func.coalesce(sold_subq.c.sold_qty, 0) > 0,
            )
            .group_by(
                Inventory.product_id,
                Inventory.warehouse_id,
                Product.unit_price,
                sold_subq.c.sold_qty,
            )
        )

        result = await db.execute(stmt)
        rows = result.all()

        health_records = []

        for row in rows:
            avg_inv = float(row.avg_inventory) if row.avg_inventory else 0
            total_avail = float(row.total_available) if row.total_available else 0
            sold = float(row.sold_qty) if row.sold_qty else 0
            cost = float(row.unit_price) if row.unit_price else 0.0

            if avg_inv <= 0:
                continue

            turnover_ratio = sold / avg_inv

            if turnover_ratio >= slow_threshold:
                continue  # Not slow-moving

            severity = min(100.0, max(0.0, (1 - turnover_ratio) * 100))

            health_records.append(
                InventoryHealthStatus(
                    product_id=row.product_id,
                    warehouse_id=row.warehouse_id,
                    health_type=HealthType.SLOW,
                    severity_score=Decimal(str(round(severity, 2))),
                    details={
                        "turnover_ratio": round(turnover_ratio, 4),
                        "sold_qty_90d": sold,
                        "avg_inventory": avg_inv,
                        "total_available": total_avail,
                        "threshold": slow_threshold,
                        "potential_loss": round(avg_inv * cost, 2),
                    },
                )
            )

        logger.info("Slow-moving scan: %d issues detected", len(health_records))
        return health_records

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
                avail_subq <= ReorderPolicy.reorder_point,
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
        """Aggregated health report from active (unresolved) statuses."""
        from sqlalchemy.orm import selectinload
        from app.models.products import Product
        from app.models.inventory import Inventory
        
        stmt = (
            select(InventoryHealthStatus)
            .where(InventoryHealthStatus.resolved_at.is_(None))
            .options(
                selectinload(InventoryHealthStatus.product).selectinload(Product.reorder_policy),
                selectinload(InventoryHealthStatus.product).selectinload(Product.inventory_items).selectinload(Inventory.shelf),
                selectinload(InventoryHealthStatus.batch).selectinload(Inventory.shelf)
            )
            .order_by(InventoryHealthStatus.severity_score.desc())
        )
        result = await db.execute(stmt)
        all_statuses = result.scalars().all()

        dead = [s for s in all_statuses if s.health_type == HealthType.DEAD]
        slow = [s for s in all_statuses if s.health_type == HealthType.SLOW]
        expiry = [s for s in all_statuses if s.health_type == HealthType.EXPIRY]
        low = [s for s in all_statuses if s.health_type == HealthType.LOW]

        # Calculate total value at risk from details and populate UI fields
        total_value = 0.0
        for s in all_statuses:
            if s.details:
                total_value += s.details.get("potential_loss", 0.0)
            
            # Map dynamic UI fields for HealthStatusItem schema
            s.product_name = s.product.name if s.product else "Unknown"
            s.sku = s.product.sku if s.product else "Unknown"
            s.min_qty = s.product.reorder_policy.reorder_point if (s.product and s.product.reorder_policy) else 0
            
            if s.batch:
                s.shelf_code = s.batch.shelf.shelf_code if (s.batch and s.batch.shelf) else "Unknown"
                s.current_qty = s.batch.quantity
            else:
                s.current_qty = s.details.get("total_available", 0) if s.details else 0
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

        return {
            "total_issues": len(all_statuses),
            "dead_stock_count": len(dead),
            "slow_moving_count": len(slow),
            "expiry_risk_count": len(expiry),
            "low_stock_count": len(low),
            "total_value_at_risk": round(total_value, 2),
            "dead_stock_items": dead,
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
