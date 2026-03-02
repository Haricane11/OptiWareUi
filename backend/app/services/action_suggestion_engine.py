"""
Action Suggestion Engine — Generates and manages DISCOUNT, BUNDLE, DISPOSAL, RETURN
suggestions based on detected health issues.

Includes approval/rejection workflow and auto-activation logic.
"""

import logging
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory
from app.models.products import Product
from app.models.orders import SalesOrder, SalesOrderItem
from app.models.receipt import Receipt, ReceiptItem
from app.models.supplier import Supplier
from app.models.promotion import Promotion, DiscountType, ApprovalStatus
from app.models.bundle import Bundle, BundleItem
from app.models.inventory_health import (
    InventoryHealthStatus,
    InventoryActionSuggestion,
    InventoryOptimizationConfig,
    HealthType,
    SuggestionType,
    SuggestionStatus,
)
from app.core.exceptions import EntityNotFoundError

logger = logging.getLogger(__name__)


class ActionSuggestionEngine:
    """Rule engine that generates actionable suggestions from health statuses."""

    # ── Main entry point ──────────────────────────────────────────────

    @staticmethod
    async def generate_suggestions(
        db: AsyncSession,
        health_statuses: list[InventoryHealthStatus],
        config: InventoryOptimizationConfig,
    ) -> list[InventoryActionSuggestion]:
        """
        For each health status, apply rule logic and generate appropriate
        suggestion(s). Returns list of persisted InventoryActionSuggestion objects.
        """
        suggestions: list[InventoryActionSuggestion] = []

        for hs in health_statuses:
            generated = await ActionSuggestionEngine._apply_rules(db, hs, config)
            suggestions.extend(generated)

        # Persist all
        for s in suggestions:
            db.add(s)
        await db.flush()

        logger.info("Generated %d action suggestions", len(suggestions))
        return suggestions

    # ── Rule application ──────────────────────────────────────────────

    @staticmethod
    async def _apply_rules(
        db: AsyncSession,
        hs: InventoryHealthStatus,
        config: InventoryOptimizationConfig,
    ) -> list[InventoryActionSuggestion]:
        """Apply business rules for a single health status."""
        results: list[InventoryActionSuggestion] = []

        if hs.health_type == HealthType.EXPIRY:
            details = hs.details or {}
            is_expired = details.get("is_expired", False)

            if is_expired:
                # Disposal for expired stock
                results.append(
                    await ActionSuggestionEngine._create_disposal_suggestion(db, hs)
                )
            else:
                # Discount for near-expiry
                results.append(
                    await ActionSuggestionEngine._create_discount_suggestion(
                        db, hs, config
                    )
                )

            # Also check return-to-supplier
            return_sug = await ActionSuggestionEngine._try_return_suggestion(db, hs)
            if return_sug:
                results.append(return_sug)

        elif hs.health_type == HealthType.SLOW:
            # Discount for slow-moving
            results.append(
                await ActionSuggestionEngine._create_discount_suggestion(
                    db, hs, config
                )
            )

        elif hs.health_type == HealthType.DEAD:
            details = hs.details or {}
            days_without_sale = details.get("days_without_sale", 0)

            if days_without_sale > 180:
                # Disposal for long-dead stock
                results.append(
                    await ActionSuggestionEngine._create_disposal_suggestion(db, hs)
                )

            # Try bundle suggestion (pair with fast-moving product)
            bundle_sug = await ActionSuggestionEngine._try_bundle_suggestion(
                db, hs, config
            )
            if bundle_sug:
                results.append(bundle_sug)

            # Try return-to-supplier
            return_sug = await ActionSuggestionEngine._try_return_suggestion(db, hs)
            if return_sug:
                results.append(return_sug)

        return results

    # ── Discount Suggestion ───────────────────────────────────────────

    @staticmethod
    async def _create_discount_suggestion(
        db: AsyncSession,
        hs: InventoryHealthStatus,
        config: InventoryOptimizationConfig,
    ) -> InventoryActionSuggestion:
        """
        Calculate discount using formula:
        discount = min(max_discount_limit,
                       base_discount + (age_factor × days_in_inventory)
                       + (stock_factor × excess_ratio))
        """
        details = hs.details or {}
        max_limit = float(config.max_discount_limit)

        # Calculate days in inventory
        if hs.health_type == HealthType.EXPIRY:
            days_in_inventory = abs(details.get("days_to_expiry", 30))
        else:
            days_in_inventory = details.get("days_without_sale", 0)

        # Calculate excess ratio (current stock / avg 90-day sales)
        avg_90d_sales = details.get("sold_qty_90d", 0)
        current_stock = details.get("total_available", details.get("quantity", 0))

        if avg_90d_sales and avg_90d_sales > 0:
            excess_ratio = float(current_stock) / float(avg_90d_sales)
        else:
            excess_ratio = 5.0  # High excess if no sales at all

        base_discount = 5.0
        age_factor = 0.1  # 0.1% per day
        stock_factor = 1.0

        discount = min(
            max_limit,
            base_discount
            + (age_factor * days_in_inventory)
            + (stock_factor * excess_ratio),
        )
        discount = round(max(discount, base_discount), 2)

        # Determine auto-activation
        auto_activate = (
            config.auto_discount_enabled
            and float(hs.severity_score) < float(config.low_risk_severity_threshold)
        )

        # Create the linked promotion (PENDING approval by default)
        product_stmt = select(Product).where(Product.id == hs.product_id)
        prod_result = await db.execute(product_stmt)
        product = prod_result.scalar_one_or_none()
        product_name = product.name if product else f"Product-{hs.product_id}"

        promotion = Promotion(
            name=f"Auto-Discount: {product_name}",
            product_id=hs.product_id,
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal(str(discount)),
            valid_from=datetime.now(timezone.utc),
            valid_until=datetime.now(timezone.utc) + timedelta(days=30),
            is_active=auto_activate,
            approval_status=(
                ApprovalStatus.APPROVED if auto_activate else ApprovalStatus.PENDING
            ),
        )
        db.add(promotion)
        await db.flush()

        reasoning = (
            f"{'Near-expiry' if hs.health_type == HealthType.EXPIRY else 'Slow-moving'} "
            f"stock detected (severity: {hs.severity_score}). "
            f"Recommended {discount}% discount. "
            f"Days in inventory: {days_in_inventory}, excess ratio: {round(excess_ratio, 2)}."
        )

        suggestion = InventoryActionSuggestion(
            product_id=hs.product_id,
            warehouse_id=hs.warehouse_id,
            batch_id=hs.batch_id,
            health_status_id=hs.id,
            suggestion_type=SuggestionType.DISCOUNT,
            reasoning=reasoning,
            severity_score=hs.severity_score,
            suggested_discount_percent=Decimal(str(discount)),
            linked_promotion_id=promotion.id,
            status=(
                SuggestionStatus.APPROVED
                if auto_activate
                else SuggestionStatus.PENDING
            ),
        )

        if auto_activate:
            logger.info(
                "Auto-activated discount for product %d: %s%%",
                hs.product_id,
                discount,
            )

        return suggestion

    # ── Bundle Suggestion ─────────────────────────────────────────────

    @staticmethod
    async def _try_bundle_suggestion(
        db: AsyncSession,
        hs: InventoryHealthStatus,
        config: InventoryOptimizationConfig,
    ) -> InventoryActionSuggestion | None:
        """
        For dead stock: find a fast-moving product in the same category
        and create a draft bundle combining both.
        """
        # Get the dead product's category
        prod_stmt = select(Product).where(Product.id == hs.product_id)
        prod_result = await db.execute(prod_stmt)
        dead_product = prod_result.scalar_one_or_none()
        if not dead_product:
            return None

        category = dead_product.category

        # Find fast-moving product in same category (highest sales in 90 days)
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        fast_mover_stmt = (
            select(
                SalesOrderItem.product_id,
                func.sum(SalesOrderItem.picked_qty).label("total_sold"),
            )
            .join(SalesOrder, SalesOrderItem.sales_order_id == SalesOrder.id)
            .join(Product, SalesOrderItem.product_id == Product.id)
            .where(
                SalesOrder.status.in_(["DELIVERED", "CLOSED"]),
                SalesOrder.created_at >= cutoff,
                Product.id != hs.product_id,
            )
        )

        # Filter by category if available
        if category:
            fast_mover_stmt = fast_mover_stmt.where(Product.category == category)

        fast_mover_stmt = (
            fast_mover_stmt.group_by(SalesOrderItem.product_id)
            .order_by(func.sum(SalesOrderItem.picked_qty).desc())
            .limit(1)
        )

        fm_result = await db.execute(fast_mover_stmt)
        fm_row = fm_result.first()

        if not fm_row:
            # No fast-moving product found — try without category filter
            if category:
                fast_mover_stmt_any = (
                    select(
                        SalesOrderItem.product_id,
                        func.sum(SalesOrderItem.picked_qty).label("total_sold"),
                    )
                    .join(SalesOrder, SalesOrderItem.sales_order_id == SalesOrder.id)
                    .where(
                        SalesOrder.status.in_(["DELIVERED", "CLOSED"]),
                        SalesOrder.created_at >= cutoff,
                        SalesOrderItem.product_id != hs.product_id,
                    )
                    .group_by(SalesOrderItem.product_id)
                    .order_by(func.sum(SalesOrderItem.picked_qty).desc())
                    .limit(1)
                )
                fm_result = await db.execute(fast_mover_stmt_any)
                fm_row = fm_result.first()

            if not fm_row:
                return None

        fast_product_id = fm_row.product_id

        # Get the fast product details
        fp_stmt = select(Product).where(Product.id == fast_product_id)
        fp_result = await db.execute(fp_stmt)
        fast_product = fp_result.scalar_one_or_none()
        if not fast_product:
            return None

        # Calculate bundle price: sum of prices - 10% bundle discount
        dead_price = float(dead_product.unit_price or 0)
        fast_price = float(fast_product.unit_price or 0)
        bundle_price = round((dead_price + fast_price) * 0.9, 2)  # 10% discount

        # Create draft bundle (inactive)
        bundle = Bundle(
            bundle_name=f"Bundle: {dead_product.name} + {fast_product.name}",
            bundle_price=Decimal(str(bundle_price)),
            is_active=False,
        )
        db.add(bundle)
        await db.flush()

        db.add(BundleItem(bundle_id=bundle.id, product_id=dead_product.id, quantity=1))
        db.add(
            BundleItem(bundle_id=bundle.id, product_id=fast_product.id, quantity=1)
        )
        await db.flush()

        reasoning = (
            f"Dead stock '{dead_product.name}' paired with fast-moving "
            f"'{fast_product.name}' (sold {fm_row.total_sold} in 90d). "
            f"Bundle price: ${bundle_price} (10% discount from combined ${round(dead_price + fast_price, 2)})."
        )

        return InventoryActionSuggestion(
            product_id=hs.product_id,
            warehouse_id=hs.warehouse_id,
            health_status_id=hs.id,
            suggestion_type=SuggestionType.BUNDLE,
            reasoning=reasoning,
            severity_score=hs.severity_score,
            linked_bundle_id=bundle.id,
            status=SuggestionStatus.PENDING,
        )

    # ── Disposal Suggestion ───────────────────────────────────────────

    @staticmethod
    async def _create_disposal_suggestion(
        db: AsyncSession,
        hs: InventoryHealthStatus,
    ) -> InventoryActionSuggestion:
        """Create a DISPOSAL suggestion for expired or long-dead stock."""
        details = hs.details or {}

        if hs.health_type == HealthType.EXPIRY:
            reasoning = (
                f"Stock expired {abs(details.get('days_to_expiry', 0))} days ago. "
                f"Batch: {details.get('batch_number', 'N/A')}, "
                f"Qty: {details.get('quantity', 0)}. "
                f"Potential loss: ${details.get('potential_loss', 0)}. "
                "Requires manager approval before disposal."
            )
        else:
            reasoning = (
                f"Dead stock for {details.get('days_without_sale', 0)} days (>180). "
                f"Available qty: {details.get('total_available', 0)}. "
                "Recommend disposal. Requires manager approval."
            )

        return InventoryActionSuggestion(
            product_id=hs.product_id,
            warehouse_id=hs.warehouse_id,
            batch_id=hs.batch_id,
            health_status_id=hs.id,
            suggestion_type=SuggestionType.DISPOSAL,
            reasoning=reasoning,
            severity_score=hs.severity_score,
            status=SuggestionStatus.PENDING,
        )

    # ── Return to Supplier Suggestion ─────────────────────────────────

    @staticmethod
    async def _try_return_suggestion(
        db: AsyncSession,
        hs: InventoryHealthStatus,
    ) -> InventoryActionSuggestion | None:
        """
        Check if:
        1. Product has a supplier
        2. Supplier allows returns
        3. Receipt is within the return window
        """
        # Get product with supplier
        prod_stmt = (
            select(Product)
            .where(Product.id == hs.product_id)
        )
        prod_result = await db.execute(prod_stmt)
        product = prod_result.scalar_one_or_none()

        if not product or not product.supplier_id:
            return None

        # Check supplier return policy
        sup_stmt = select(Supplier).where(Supplier.id == product.supplier_id)
        sup_result = await db.execute(sup_stmt)
        supplier = sup_result.scalar_one_or_none()

        if not supplier or not supplier.allows_return:
            return None

        # Check if there's a receipt within the return window
        return_window = supplier.return_window_days or 60
        window_cutoff = datetime.now(timezone.utc) - timedelta(days=return_window)

        receipt_stmt = (
            select(func.count())
            .select_from(ReceiptItem)
            .join(Receipt, ReceiptItem.receipt_id == Receipt.id)
            .where(
                ReceiptItem.product_id == hs.product_id,
                Receipt.received_at >= window_cutoff,
            )
        )
        receipt_result = await db.execute(receipt_stmt)
        receipt_count = receipt_result.scalar() or 0

        if receipt_count == 0:
            return None

        reasoning = (
            f"Supplier '{supplier.name}' allows returns (window: {return_window} days). "
            f"Recent receipt found within return window. "
            f"Product: {product.name}."
        )

        return InventoryActionSuggestion(
            product_id=hs.product_id,
            warehouse_id=hs.warehouse_id,
            batch_id=hs.batch_id,
            health_status_id=hs.id,
            suggestion_type=SuggestionType.RETURN,
            reasoning=reasoning,
            severity_score=hs.severity_score,
            status=SuggestionStatus.PENDING,
        )

    # ── Approval Workflow ─────────────────────────────────────────────

    @staticmethod
    async def approve_action(
        db: AsyncSession,
        suggestion_id: int,
        approved_by: int | None = None,
    ) -> InventoryActionSuggestion:
        """
        Approve a suggestion — activates linked Promotion or Bundle.
        """
        stmt = select(InventoryActionSuggestion).where(
            InventoryActionSuggestion.id == suggestion_id
        )
        result = await db.execute(stmt)
        suggestion = result.scalar_one_or_none()

        if not suggestion:
            raise EntityNotFoundError("ActionSuggestion", suggestion_id)

        suggestion.status = SuggestionStatus.APPROVED
        suggestion.approved_by = approved_by
        suggestion.approved_at = datetime.now(timezone.utc)

        # Activate linked promotion
        if suggestion.linked_promotion_id:
            promo_stmt = select(Promotion).where(
                Promotion.id == suggestion.linked_promotion_id
            )
            promo_result = await db.execute(promo_stmt)
            promo = promo_result.scalar_one_or_none()
            if promo:
                promo.is_active = True
                promo.approval_status = ApprovalStatus.APPROVED
                promo.approved_by = approved_by
                promo.approved_at = datetime.now(timezone.utc)

        # Activate linked bundle
        if suggestion.linked_bundle_id:
            bundle_stmt = select(Bundle).where(
                Bundle.id == suggestion.linked_bundle_id
            )
            bundle_result = await db.execute(bundle_stmt)
            bundle = bundle_result.scalar_one_or_none()
            if bundle:
                bundle.is_active = True

        await db.flush()
        logger.info("Approved suggestion %d", suggestion_id)
        return suggestion

    @staticmethod
    async def reject_action(
        db: AsyncSession,
        suggestion_id: int,
        reason: str | None = None,
    ) -> InventoryActionSuggestion:
        """Reject a suggestion."""
        stmt = select(InventoryActionSuggestion).where(
            InventoryActionSuggestion.id == suggestion_id
        )
        result = await db.execute(stmt)
        suggestion = result.scalar_one_or_none()

        if not suggestion:
            raise EntityNotFoundError("ActionSuggestion", suggestion_id)

        suggestion.status = SuggestionStatus.REJECTED
        await db.flush()
        logger.info("Rejected suggestion %d (reason: %s)", suggestion_id, reason)
        return suggestion

    @staticmethod
    async def execute_action(
        db: AsyncSession,
        suggestion_id: int,
    ) -> InventoryActionSuggestion:
        """Mark a suggestion as executed (post-approval completion)."""
        stmt = select(InventoryActionSuggestion).where(
            InventoryActionSuggestion.id == suggestion_id
        )
        result = await db.execute(stmt)
        suggestion = result.scalar_one_or_none()

        if not suggestion:
            raise EntityNotFoundError("ActionSuggestion", suggestion_id)

        if suggestion.status != SuggestionStatus.APPROVED:
            raise ValueError(
                f"Cannot execute suggestion in status '{suggestion.status.value}'. "
                "Must be APPROVED first."
            )

        suggestion.status = SuggestionStatus.EXECUTED
        await db.flush()
        logger.info("Executed suggestion %d", suggestion_id)
        return suggestion

    # ── Manual Bundle Creation ────────────────────────────────────────

    @staticmethod
    async def create_manual_bundle(
        db: AsyncSession,
        bundle_name: str,
        bundle_price: float,
        items: list[dict],
        linked_suggestion_id: int | None = None,
    ) -> Bundle:
        """
        Manager creates a bundle manually.
        Optionally links it to an existing health suggestion.
        Does NOT auto-delete any existing bundles.
        """
        bundle = Bundle(
            bundle_name=bundle_name,
            bundle_price=Decimal(str(bundle_price)),
            is_active=False,  # Requires explicit activation
        )
        db.add(bundle)
        await db.flush()

        for item in items:
            db.add(
                BundleItem(
                    bundle_id=bundle.id,
                    product_id=item["product_id"],
                    quantity=item["quantity"],
                )
            )
        await db.flush()

        # Link to suggestion if provided
        if linked_suggestion_id:
            sug_stmt = select(InventoryActionSuggestion).where(
                InventoryActionSuggestion.id == linked_suggestion_id
            )
            sug_result = await db.execute(sug_stmt)
            suggestion = sug_result.scalar_one_or_none()
            if suggestion:
                suggestion.linked_bundle_id = bundle.id
                await db.flush()

        logger.info("Created manual bundle %d: %s", bundle.id, bundle_name)
        return bundle

    # ── Full Scan Orchestrator ────────────────────────────────────────

    @staticmethod
    async def run_full_scan(db: AsyncSession) -> dict:
        """
        Nightly health scan orchestrator:
        1. Load config
        2. Resolve old health statuses
        3. Run all 3 detectors
        4. Persist new statuses
        5. Generate action suggestions
        """
        import time

        start = time.time()

        # Load config
        from app.services.inventory_health_service import InventoryHealthService

        config = await InventoryHealthService.get_or_create_config(db)

        # Resolve old statuses
        resolved = await InventoryHealthService.resolve_old_statuses(db)
        logger.info("Resolved %d old health statuses", resolved)

        # Clear out old PENDING suggestions before regenerating
        from sqlalchemy import delete
        from app.models.inventory_health import InventoryActionSuggestion, SuggestionStatus
        del_stmt = delete(InventoryActionSuggestion).where(
            InventoryActionSuggestion.status == SuggestionStatus.PENDING
        )
        del_result = await db.execute(del_stmt)
        logger.info("Cleared %d old pending suggestions", del_result.rowcount)

        # Run detectors
        dead = await InventoryHealthService.detect_dead_stock(db, config)
        slow = await InventoryHealthService.detect_slow_moving(db, config)
        expiry = await InventoryHealthService.detect_expiry_risk(db, config)

        # Persist all
        all_statuses = dead + slow + expiry
        await InventoryHealthService.persist_statuses(db, all_statuses)

        # Generate suggestions
        suggestions = await ActionSuggestionEngine.generate_suggestions(
            db, all_statuses, config
        )

        duration = round(time.time() - start, 3)

        summary = {
            "dead_stock_detected": len(dead),
            "slow_moving_detected": len(slow),
            "expiry_risk_detected": len(expiry),
            "suggestions_generated": len(suggestions),
            "scan_duration_seconds": duration,
        }

        logger.info("Health scan complete: %s", summary)
        return summary
