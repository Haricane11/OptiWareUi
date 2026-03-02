"""
DemandAnalysisService — Computes dynamic demand-driven reorder metrics.

Data source: delivery_note_items × delivery_notes (fulfilled shipments only).
Generates a complete daily time series for the demand window and fills
missing dates with zero to avoid underestimating volatility.

Formulas:
  ADD   = total_shipped / window_days
  σ_d   = stdev(full daily series including zero-fill days)
  SS    = Z × σ_d × √lead_time
  ROP   = (ADD × lead_time) + SS
  EOQ   = √((2 × D × S) / H)   where D = ADD × 365

Edge cases:
  - Zero shipments     → ADD=0, σ_d=0, ROP=0
  - sample_size < 2    → σ_d=0
  - costs ≤ 0          → skip EOQ (keep existing)
  - lead_time ≤ 0      → SS=0, ROP=ADD
"""

import logging
import math
import statistics
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func, cast, Date as SADate
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orders import SalesOrderItem, DeliveryNote, DeliveryNoteItem
from app.models.reorder_policy import ReorderPolicy
from app.models.demand_analytics import ProductDemandAnalytics

logger = logging.getLogger(__name__)


class DemandMetrics:
    """Value object holding computed demand metrics."""

    __slots__ = (
        "average_daily_demand",
        "demand_std_dev",
        "sample_size",
        "total_shipped",
        "window_days",
    )

    def __init__(
        self,
        average_daily_demand: float,
        demand_std_dev: float,
        sample_size: int,
        total_shipped: int,
        window_days: int,
    ) -> None:
        self.average_daily_demand = average_daily_demand
        self.demand_std_dev = demand_std_dev
        self.sample_size = sample_size
        self.total_shipped = total_shipped
        self.window_days = window_days


class DemandAnalysisService:
    """
    Stateless service that computes demand metrics from fulfilled shipments
    and persists them into ReorderPolicy + ProductDemandAnalytics.

    All methods are static and async, accepting an AsyncSession.
    """

    # ── Core demand computation ───────────────────────────────────────

    @staticmethod
    async def compute_demand_metrics(
        db: AsyncSession,
        product_id: int,
        window_days: int = 90,
    ) -> DemandMetrics:
        """
        Compute Average Daily Demand and standard deviation from shipment history.

        Steps:
          1. Query daily shipped qty from delivery_note_items for the window.
          2. Build a complete daily time series (window_days entries).
          3. Fill missing dates with 0.
          4. Compute ADD and σ_d.

        Args:
            db: Async database session.
            product_id: Target product ID.
            window_days: Number of days to look back (default 90).

        Returns:
            DemandMetrics value object.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

        # Query: daily shipped qty grouped by date
        # Join: delivery_note_items → delivery_notes (for shipped_at)
        #        delivery_note_items → sales_order_items (for product_id)
        stmt = (
            select(
                cast(DeliveryNote.shipped_at, SADate).label("ship_date"),
                func.sum(DeliveryNoteItem.shipped_qty).label("daily_qty"),
            )
            .select_from(DeliveryNoteItem)
            .join(
                DeliveryNote,
                DeliveryNoteItem.delivery_note_id == DeliveryNote.id,
            )
            .join(
                SalesOrderItem,
                DeliveryNoteItem.sales_order_item_id == SalesOrderItem.id,
            )
            .where(
                SalesOrderItem.product_id == product_id,
                DeliveryNoteItem.shipped_qty > 0,
                DeliveryNote.shipped_at.isnot(None),
                DeliveryNote.shipped_at >= cutoff,
            )
            .group_by(cast(DeliveryNote.shipped_at, SADate))
        )

        result = await db.execute(stmt)
        rows = result.all()

        # Build lookup: date → qty
        daily_lookup: dict[date, int] = {}
        for row in rows:
            ship_date = row.ship_date
            if isinstance(ship_date, datetime):
                ship_date = ship_date.date()
            daily_lookup[ship_date] = int(row.daily_qty)

        # Generate complete daily series with zero-fill
        today = date.today()
        daily_series: list[float] = []
        for i in range(window_days):
            day = today - timedelta(days=window_days - 1 - i)
            daily_series.append(float(daily_lookup.get(day, 0)))

        # Compute metrics
        total_shipped = sum(daily_series)
        sample_size = len([v for v in daily_series if v > 0])
        add = total_shipped / window_days if window_days > 0 else 0.0

        # Standard deviation over the FULL series (including zero days)
        if len(daily_series) >= 2:
            std_dev = statistics.stdev(daily_series)
        else:
            std_dev = 0.0

        return DemandMetrics(
            average_daily_demand=round(add, 4),
            demand_std_dev=round(std_dev, 4),
            sample_size=sample_size,
            total_shipped=int(total_shipped),
            window_days=window_days,
        )

    # ── Full policy computation + persistence ─────────────────────────

    @staticmethod
    async def compute_reorder_policy(
        db: AsyncSession,
        product_id: int,
    ) -> dict:
        """
        Compute and persist dynamic reorder metrics for a single product.

        1. Lock the ReorderPolicy row (SELECT FOR UPDATE).
        2. Compute demand metrics from shipment history.
        3. Compute Safety Stock, ROP, EOQ.
        4. Update ReorderPolicy and ProductDemandAnalytics.

        Args:
            db: Async database session (must be inside a transaction).
            product_id: Target product ID.

        Returns:
            Dict with all computed values.
        """
        # Lock the policy row
        policy_stmt = (
            select(ReorderPolicy)
            .where(ReorderPolicy.product_id == product_id)
            .with_for_update()
        )
        policy_result = await db.execute(policy_stmt)
        policy = policy_result.scalar_one_or_none()

        if not policy:
            logger.warning(
                "No ReorderPolicy for product %d — skipping", product_id,
            )
            return {
                "product_id": product_id,
                "status": "skipped",
                "detail": "No reorder policy configured",
            }

        # ── Step 1: Compute demand metrics ────────────────────────────
        window_days = policy.demand_window_days or 90
        metrics = await DemandAnalysisService.compute_demand_metrics(
            db, product_id, window_days,
        )

        add = metrics.average_daily_demand
        std_dev = metrics.demand_std_dev

        # ── Step 2: Safety Stock ──────────────────────────────────────
        lead_time: int = policy.lead_time_days or 0
        z_score: float = float(policy.service_level or Decimal("1.65"))

        if lead_time > 0:
            safety_stock = z_score * std_dev * math.sqrt(lead_time)
        else:
            safety_stock = 0.0

        # ── Step 3: Reorder Point ─────────────────────────────────────
        if lead_time > 0:
            rop = (add * lead_time) + safety_stock
        else:
            rop = add  # fallback: next-day demand

        # ── Step 4: EOQ ───────────────────────────────────────────────
        ordering_cost = float(policy.ordering_cost or 0)
        holding_cost = float(policy.holding_cost or 0)
        eoq: Optional[int] = None

        if ordering_cost > 0 and holding_cost > 0:
            annual_demand = add * 365
            if annual_demand > 0:
                eoq = int(
                    round(math.sqrt((2 * annual_demand * ordering_cost) / holding_cost))
                )

        # ── Step 5: Persist to ReorderPolicy ──────────────────────────
        policy.average_daily_demand = Decimal(str(round(add, 4)))
        policy.demand_std_dev = Decimal(str(round(std_dev, 4)))
        policy.safety_stock = int(round(safety_stock))
        policy.reorder_point = int(round(rop))
        if eoq is not None:
            policy.eoq = eoq
        policy.last_computed_at = datetime.now(timezone.utc)

        # ── Step 6: Persist to ProductDemandAnalytics ─────────────────
        analytics_stmt = (
            select(ProductDemandAnalytics)
            .where(ProductDemandAnalytics.product_id == product_id)
        )
        analytics_result = await db.execute(analytics_stmt)
        analytics = analytics_result.scalar_one_or_none()

        if analytics:
            analytics.average_daily_demand = Decimal(str(round(add, 4)))
            analytics.demand_std_dev = Decimal(str(round(std_dev, 4)))
            analytics.window_days = window_days
            analytics.sample_size = metrics.sample_size
            analytics.last_updated = datetime.now(timezone.utc)
        else:
            db.add(ProductDemandAnalytics(
                product_id=product_id,
                average_daily_demand=Decimal(str(round(add, 4))),
                demand_std_dev=Decimal(str(round(std_dev, 4))),
                window_days=window_days,
                sample_size=metrics.sample_size,
            ))

        await db.flush()

        computed = {
            "product_id": product_id,
            "status": "computed",
            "average_daily_demand": round(add, 4),
            "demand_std_dev": round(std_dev, 4),
            "safety_stock": int(round(safety_stock)),
            "reorder_point": int(round(rop)),
            "eoq": eoq if eoq is not None else policy.eoq,
            "lead_time_days": lead_time,
            "window_days": window_days,
            "sample_size": metrics.sample_size,
            "total_shipped": metrics.total_shipped,
        }
        logger.info(
            "Demand analysis for product %d: ADD=%.4f, σ=%.4f, ROP=%d, SS=%d, EOQ=%s",
            product_id, add, std_dev,
            computed["reorder_point"], computed["safety_stock"],
            str(computed["eoq"]),
        )
        return computed

    # ── Batch recalculation ───────────────────────────────────────────

    @staticmethod
    async def recalculate_all_policies(db: AsyncSession) -> list[dict]:
        """
        Recalculate demand metrics for ALL products that have a ReorderPolicy.

        Uses a single query to fetch all product_ids, then computes each
        sequentially (each computation locks its own row, so no N+1 on
        the lock itself).

        Args:
            db: Async database session (caller should manage the transaction).

        Returns:
            List of result dicts, one per product.
        """
        stmt = select(ReorderPolicy.product_id)
        result = await db.execute(stmt)
        product_ids = [row[0] for row in result.all()]

        results: list[dict] = []
        for pid in product_ids:
            try:
                computed = await DemandAnalysisService.compute_reorder_policy(
                    db, pid,
                )
                results.append(computed)
            except Exception:
                logger.exception(
                    "Failed to compute demand for product %d", pid,
                )
                results.append({
                    "product_id": pid,
                    "status": "error",
                    "detail": "Computation failed — see logs",
                })

        return results
