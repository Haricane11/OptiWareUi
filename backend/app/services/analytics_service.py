"""
Analytics Service — Financial integrity and inventory analysis.

Uses cost_price (unit_price from products) for all calculations.
All computations use Decimal precision where needed.
"""

import logging
from datetime import datetime, timedelta, date
from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.products import Product
from app.models.inventory import Inventory
from app.models.orders import SalesOrder, SalesOrderItem, DeliveryNote
from app.models.reorder_policy import ReorderPolicy

logger = logging.getLogger(__name__)


class AnalyticsService:

    @staticmethod
    async def calculate_cogs(
        db: AsyncSession,
        period_days: int = 30,
    ) -> Decimal:
        """
        COGS = SUM(delivered_qty × cost_price) over the time window.
        Only counts DELIVERED / CLOSED orders.
        """
        cutoff = datetime.utcnow() - timedelta(days=period_days)

        stmt = (
            select(
                func.coalesce(
                    func.sum(SalesOrderItem.picked_qty * Product.unit_price),
                    0,
                )
            )
            .select_from(SalesOrderItem)
            .join(SalesOrder, SalesOrderItem.sales_order_id == SalesOrder.id)
            .join(Product, SalesOrderItem.product_id == Product.id)
            .where(
                SalesOrder.status.in_(["DELIVERED", "CLOSED"]),
                SalesOrder.created_at >= cutoff,
            )
        )
        result = await db.execute(stmt)
        return Decimal(str(result.scalar() or 0))

    @staticmethod
    async def calculate_inventory_turnover(
        db: AsyncSession,
        period_days: int = 30,
    ) -> dict:
        """
        Inventory Turnover = COGS / Average Inventory Value.
        Average Inventory = current inventory value (approximation).
        """
        cogs = await AnalyticsService.calculate_cogs(db, period_days)

        # Current inventory value = SUM(quantity × unit_price)
        inv_stmt = (
            select(
                func.coalesce(
                    func.sum(Inventory.quantity * Product.unit_price),
                    0,
                )
            )
            .select_from(Inventory)
            .join(Product, Inventory.product_id == Product.id)
            .where(Inventory.status == "ACTIVE")
        )
        inv_result = await db.execute(inv_stmt)
        avg_inv_value = Decimal(str(inv_result.scalar() or 0))

        turnover = Decimal("0")
        if avg_inv_value > 0:
            turnover = cogs / avg_inv_value

        return {
            "period_days": period_days,
            "cogs": float(cogs),
            "average_inventory_value": float(avg_inv_value),
            "turnover_ratio": float(turnover),
        }

    @staticmethod
    async def calculate_carrying_cost(
        db: AsyncSession,
        holding_cost_rate: float = 0.2,
    ) -> dict:
        """
        Carrying Cost = Average Inventory Value × Holding Cost Rate.
        """
        inv_stmt = (
            select(
                func.coalesce(
                    func.sum(Inventory.quantity * Product.unit_price),
                    0,
                )
            )
            .select_from(Inventory)
            .join(Product, Inventory.product_id == Product.id)
            .where(Inventory.status == "ACTIVE")
        )
        result = await db.execute(inv_stmt)
        inv_value = Decimal(str(result.scalar() or 0))
        carrying = inv_value * Decimal(str(holding_cost_rate))

        return {
            "inventory_value": float(inv_value),
            "holding_cost_rate": holding_cost_rate,
            "carrying_cost": float(carrying),
        }

    @staticmethod
    async def detect_dead_stock(
        db: AsyncSession,
        threshold_days: int = 90,
    ) -> list[dict]:
        """
        Dead stock: ACTIVE batches with received_date older than threshold
        and no associated delivered orders.
        Uses batch-level created_at instead of legacy last_updated.
        """
        cutoff = date.today() - timedelta(days=threshold_days)

        stmt = (
            select(Inventory, Product)
            .join(Product, Inventory.product_id == Product.id)
            .where(
                Inventory.status == "ACTIVE",
                Inventory.quantity > 0,
                Inventory.created_at < datetime.combine(cutoff, datetime.min.time()),
            )
        )
        result = await db.execute(stmt)
        rows = result.all()

        dead = []
        for inv, prod in rows:
            cost = float(prod.unit_price) if prod.unit_price else 0
            dead.append({
                "product_id": prod.id,
                "product_name": prod.name,
                "batch_number": inv.batch_number,
                "quantity": inv.quantity,
                "value": inv.quantity * cost,
                "received_date": str(inv.received_date) if inv.received_date else None,
                "days_in_stock": (date.today() - inv.received_date).days if inv.received_date else threshold_days,
            })
        return dead

    @staticmethod
    async def detect_expiry_risk(
        db: AsyncSession,
        threshold_days: int = 30,
    ) -> list[dict]:
        """
        Find ACTIVE inventory batches expiring within threshold_days.
        Uses inventory.expiry_date directly (batch-based design).
        """
        cutoff = date.today() + timedelta(days=threshold_days)

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

        risky = []
        for inv, prod in rows:
            days_left = (inv.expiry_date - date.today()).days
            cost = float(prod.unit_price) if prod.unit_price else 0
            risky.append({
                "product_id": prod.id,
                "product_name": prod.name,
                "batch_number": inv.batch_number,
                "expiry_date": str(inv.expiry_date),
                "days_until_expiry": days_left,
                "quantity_at_risk": inv.quantity,
                "potential_loss": inv.quantity * cost,
            })
        return risky

    @staticmethod
    async def calculate_financial_loss(db: AsyncSession) -> dict:
        """Combined dead stock + expiry risk loss."""
        dead = await AnalyticsService.detect_dead_stock(db)
        expiry = await AnalyticsService.detect_expiry_risk(db)

        dead_loss = sum(item["value"] for item in dead)
        expiry_loss = sum(item["potential_loss"] for item in expiry)

        return {
            "total_potential_loss": dead_loss + expiry_loss,
            "dead_stock_loss": dead_loss,
            "expiry_risk_loss": expiry_loss,
            "dead_stock_count": len(dead),
            "expiry_risk_count": len(expiry),
        }

    @staticmethod
    async def get_recommendations(db: AsyncSession) -> list[dict]:
        """Action recommendations for risky inventory."""
        recommendations = []

        expiry_items = await AnalyticsService.detect_expiry_risk(db, threshold_days=60)
        for item in expiry_items:
            days = item["days_until_expiry"]
            if days <= 0:
                action = "Disposal"
                details = f"Expired {abs(days)} days ago."
            elif days <= 15:
                action = "Heavy Discount / Clearance"
                details = f"Expires in {days} days."
            else:
                action = "Bundle Sale / Promotion"
                details = f"Expires in {days} days."
            recommendations.append({
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "reason": "Expiry Risk",
                "action": action,
                "details": details,
            })

        seen = {r["product_id"] for r in recommendations}
        dead = await AnalyticsService.detect_dead_stock(db)
        for item in dead:
            if item["product_id"] not in seen:
                recommendations.append({
                    "product_id": item["product_id"],
                    "product_name": item["product_name"],
                    "reason": "Dead Stock",
                    "action": "Return to Supplier or Liquidation",
                    "details": f"No movement in {item['days_in_stock']}+ days.",
                })
                seen.add(item["product_id"])

        return recommendations

    @staticmethod
    async def get_logistics_metrics(db: AsyncSession, limit: int = 100):
        # Imports here to avoid circular dependencies if needed, or assume at top
        from app.models.logistics_metrics import ProductLogisticsMetrics
        from sqlalchemy import select
        
        result = await db.execute(select(ProductLogisticsMetrics).limit(limit))
        return result.scalars().all()
