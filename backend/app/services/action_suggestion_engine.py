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

        elif hs.health_type == HealthType.DORMANT:
            # Discount for dormant stock (similar to slow-moving)
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
        bundle_name = f"Bundle: {dead_product.name} + {fast_product.name}"[:100]
        bundle = Bundle(
            bundle_name=bundle_name,
            bundle_price=Decimal(str(round(bundle_price, 2))),
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
    ) -> dict | InventoryActionSuggestion:
        """Mark a suggestion as executed (post-approval completion) and apply physical changes."""
        from app.models.inventory import InventoryTransaction, Inventory
        from fastapi import HTTPException
        
        stmt = select(InventoryActionSuggestion).where(
            InventoryActionSuggestion.id == suggestion_id
        ).with_for_update()
        result = await db.execute(stmt)
        suggestion = result.scalar_one_or_none()

        if not suggestion:
            raise EntityNotFoundError("ActionSuggestion", suggestion_id)

        # Idempotency protection
        if suggestion.status == SuggestionStatus.EXECUTED:
            raise HTTPException(status_code=409, detail="Action already executed.")

        # Auto-approve PENDING suggestions on execute (original flow: click Execute → action happens)
        if suggestion.status == SuggestionStatus.PENDING:
            suggestion.status = SuggestionStatus.APPROVED

        if suggestion.suggestion_type == SuggestionType.DISPOSAL:
            # Transaction Ledger Consistency (Idempotency fallback)
            trans_stmt = select(InventoryTransaction).where(
                InventoryTransaction.reference_action_id == suggestion_id,
                InventoryTransaction.transaction_type == "WRITE_OFF"
            )
            existing_trans = (await db.execute(trans_stmt)).scalar_one_or_none()
            if existing_trans:
                raise HTTPException(status_code=409, detail="Write-off transaction already exists.")

            # We need to deduct from the exact inventory record, usually tracked by batch_id
            product_stmt = select(Product).where(Product.id == suggestion.product_id)
            pr = await db.execute(product_stmt)
            product = pr.scalar_one_or_none()
            unit_cost = float(product.cost if product and product.cost else (product.unit_price if product and product.unit_price else 0))

            # Retrieve the specific batch if batch_id is set, otherwise default to oldest active inventory
            if suggestion.batch_id:
                inv_stmt = select(Inventory).where(Inventory.id == suggestion.batch_id).with_for_update()
            else:
                inv_stmt = (
                    select(Inventory)
                    .where(
                        Inventory.product_id == suggestion.product_id,
                        Inventory.warehouse_id == suggestion.warehouse_id,
                        Inventory.status == "ACTIVE",
                        Inventory.available > 0
                    )
                    .order_by(Inventory.created_at.asc())
                    .limit(1)
                    .with_for_update()
                )

            inv_exec = await db.execute(inv_stmt)
            inventory = inv_exec.scalar_one_or_none()

            raw_qty = 0
            if inventory:
                raw_qty = inventory.available
                qty_to_deduct = max(0, min(raw_qty, inventory.quantity))
                
                # Deduct constraints preventing negative inventory
                inventory.quantity = inventory.quantity - qty_to_deduct
                inventory.available = inventory.available - qty_to_deduct
                if inventory.quantity <= 0:
                    inventory.status = "DEPLETED"
                remaining_inventory = inventory.quantity
            else:
                qty_to_deduct = 0
                remaining_inventory = 0

            loss_value = Decimal(str(qty_to_deduct * unit_cost))
            
            # Generate WRITE_OFF payload
            trans = InventoryTransaction(
                transaction_type="WRITE_OFF",
                product_id=suggestion.product_id,
                warehouse_id=suggestion.warehouse_id,
                quantity=qty_to_deduct,
                reason="Dead Stock Disposal",
                reference_action_id=suggestion.id,
                loss_value=loss_value
            )

            db.add(trans)
            
            suggestion.status = SuggestionStatus.EXECUTED
            suggestion.executed_at = datetime.now(timezone.utc)
            await db.flush()
            logger.info("Executed suggestion %d", suggestion_id)
            
            return {
                "status": "success",
                "action_id": suggestion.id,
                "executed_quantity": qty_to_deduct,
                "remaining_inventory": remaining_inventory,
                "write_off_value": float(loss_value),
                "message": f"Disposed {qty_to_deduct} units. Write-off value: ${float(loss_value):,.2f}. Remaining: {remaining_inventory}."
            }
        elif suggestion.suggestion_type in (SuggestionType.DISCOUNT, SuggestionType.HEAVY_DISCOUNT):
            # ── DISCOUNT / HEAVY_DISCOUNT execution ──────────────────────
            # Activate the linked Promotion record
            from app.models.promotion import Promotion, ApprovalStatus as PromoApproval

            product_stmt = select(Product).where(Product.id == suggestion.product_id)
            product = (await db.execute(product_stmt)).scalar_one_or_none()
            product_name = product.name if product else f"Product-{suggestion.product_id}"

            if suggestion.linked_promotion_id:
                promo_stmt = select(Promotion).where(
                    Promotion.id == suggestion.linked_promotion_id
                ).with_for_update()
                promo = (await db.execute(promo_stmt)).scalar_one_or_none()
                if promo:
                    promo.is_active = True
                    promo.approval_status = PromoApproval.APPROVED
                    promo.approved_at = datetime.now(timezone.utc)
            else:
                # Create a new Promotion if suggestion was orphaned
                from app.models.promotion import DiscountType
                discount_pct = float(suggestion.suggested_discount_percent or 15)
                promo = Promotion(
                    name=f"Executed Discount: {product_name}",
                    product_id=suggestion.product_id,
                    discount_type=DiscountType.PERCENTAGE,
                    discount_value=Decimal(str(discount_pct)),
                    valid_from=datetime.now(timezone.utc),
                    valid_until=datetime.now(timezone.utc) + timedelta(days=30),
                    is_active=True,
                    approval_status=PromoApproval.APPROVED,
                    approved_at=datetime.now(timezone.utc),
                )
                db.add(promo)
                await db.flush()
                suggestion.linked_promotion_id = promo.id

            suggestion.status = SuggestionStatus.EXECUTED
            suggestion.executed_at = datetime.now(timezone.utc)
            await db.flush()
            logger.info("Executed DISCOUNT suggestion %d for product %s", suggestion_id, product_name)

            return {
                "status": "success",
                "action_id": suggestion.id,
                "action_type": "DISCOUNT",
                "product_name": product_name,
                "discount_percent": float(suggestion.suggested_discount_percent or 0),
                "message": f"Discount of {suggestion.suggested_discount_percent or 0}% activated for {product_name}."
            }

        elif suggestion.suggestion_type == SuggestionType.BUNDLE:
            # ── BUNDLE execution ─────────────────────────────────────────
            # Activate the linked Bundle record
            from app.models.bundle import Bundle

            product_stmt = select(Product).where(Product.id == suggestion.product_id)
            product = (await db.execute(product_stmt)).scalar_one_or_none()
            product_name = product.name if product else f"Product-{suggestion.product_id}"

            if suggestion.linked_bundle_id:
                bundle_stmt = select(Bundle).where(
                    Bundle.id == suggestion.linked_bundle_id
                ).with_for_update()
                bundle = (await db.execute(bundle_stmt)).scalar_one_or_none()
                if bundle:
                    bundle.is_active = True
                    bundle_name = bundle.bundle_name
                else:
                    bundle_name = "Unknown Bundle"
            else:
                # Create a new Bundle if suggestion was orphaned/auto-generated
                from app.models.bundle import BundleItem
                from app.models.inventory_health_analytics import InventoryHealthAnalytics
                
                # Find a fast-moving product to pair with
                fast_stmt = (
                    select(Product, InventoryHealthAnalytics.velocity_score)
                    .join(InventoryHealthAnalytics, InventoryHealthAnalytics.product_id == Product.id)
                    .where(Product.id != suggestion.product_id)
                    .order_by(InventoryHealthAnalytics.velocity_score.desc())
                    .limit(1)
                )
                fast_result = (await db.execute(fast_stmt)).first()
                if not fast_result:
                    raise ValueError("No fast-moving product available to bundle with.")
                
                fast_prod, _ = fast_result
                
                # Calculate bundle price (e.g. 10% discount on combined price)
                base_price = Decimal(str(product.unit_price or 0)) + Decimal(str(fast_prod.unit_price or 0))
                bundle_price = base_price * Decimal('0.90')
                bundle_name = f"Value Pack: {product_name} + {fast_prod.name}"
                
                new_bundle = Bundle(
                    bundle_name=bundle_name[:255],
                    bundle_price=bundle_price,
                    is_active=True
                )
                db.add(new_bundle)
                await db.flush()
                
                # Add items
                db.add(BundleItem(bundle_id=new_bundle.id, product_id=suggestion.product_id, quantity=1))
                db.add(BundleItem(bundle_id=new_bundle.id, product_id=fast_prod.id, quantity=1))
                await db.flush()
                
                suggestion.linked_bundle_id = new_bundle.id

            suggestion.status = SuggestionStatus.EXECUTED
            suggestion.executed_at = datetime.now(timezone.utc)
            await db.flush()
            logger.info("Executed BUNDLE suggestion %d for product %s", suggestion_id, product_name)

            return {
                "status": "success",
                "action_id": suggestion.id,
                "action_type": "BUNDLE",
                "product_name": product_name,
                "bundle_name": bundle_name,
                "message": f"Bundle '{bundle_name}' activated for {product_name}."
            }

        else:
            raise ValueError(f"Unsupported action type: {suggestion.suggestion_type}")

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

        # Run legacy detectors
        expiry = await InventoryHealthService.detect_expiry_risk(db, config)
        low = await InventoryHealthService.detect_low_stock(db, config)

        # Persist legacy statuses
        all_statuses = expiry + low
        await InventoryHealthService.persist_statuses(db, all_statuses)

        # Generate suggestions for legacy statuses
        suggestions = await ActionSuggestionEngine.generate_suggestions(
            db, all_statuses, config
        )

        # --- V2 Unified Analytics Suggestions ---
        from app.models.inventory_health_analytics import InventoryHealthAnalytics, HealthClassification, RecommendedAction
        from app.services.inventory_classification_service import InventoryClassificationService

        # 1. Ensure all health metrics are up to date
        await InventoryClassificationService.ensure_inventory_health_records(db)

        # 2. Fetch all DEAD and SLOW items
        analytics_stmt = select(InventoryHealthAnalytics).where(
            InventoryHealthAnalytics.classification.in_([
                HealthClassification.DEAD, 
                HealthClassification.SLOW_MOVING
            ])
        )
        analytics_result = await db.execute(analytics_stmt)
        analytics_rows = analytics_result.scalars().all()

        dead_count = sum(1 for a in analytics_rows if a.classification == HealthClassification.DEAD)
        slow_count = sum(1 for a in analytics_rows if a.classification == HealthClassification.SLOW_MOVING)

        # Generate suggestions from unified model recommendations
        for an in analytics_rows:
            if an.recommended_action == RecommendedAction.NONE:
                continue
                
            # Get dynamic warehouse_id from Inventory or fallback to first available
            inv_stmt = select(Inventory.warehouse_id).where(Inventory.product_id == an.product_id).limit(1)
            warehouse_id = (await db.execute(inv_stmt)).scalar()
            if not warehouse_id:
                from app.models.warehouse import Warehouse
                wh_stmt = select(Warehouse.id).limit(1)
                warehouse_id = (await db.execute(wh_stmt)).scalar() or 1

            # Create a mock HealthStatus to pass into the suggestion generators
            mock_hs = InventoryHealthStatus(
                id=None, # No legacy ID
                product_id=an.product_id,
                warehouse_id=warehouse_id,        
                health_type=HealthType.DEAD if an.classification == HealthClassification.DEAD else HealthType.SLOW,
                severity_score=Decimal(str(an.dead_stock_severity_score)),
                details={
                    "days_without_sale": an.days_since_last_sale,
                    "total_available": an.overstock_ratio * 10,  # Approximate for rule engine fallback
                }
            )

            if an.recommended_action == RecommendedAction.DISPOSAL:
                sug = await ActionSuggestionEngine._create_disposal_suggestion(db, mock_hs)
                sug.reasoning = f"Unified Model Recommendation: Disposal due to {an.classification.value} classification."
                suggestions.append(sug)
                db.add(sug)
            elif an.recommended_action == RecommendedAction.BUNDLE:
                sug = await ActionSuggestionEngine._try_bundle_suggestion(db, mock_hs, config)
                if sug:
                    sug.reasoning = f"Unified Model Recommendation: Bundle due to high-margin {an.classification.value} stock."
                    suggestions.append(sug)
                    db.add(sug)
            elif an.recommended_action == RecommendedAction.DISCOUNT:
                sug = await ActionSuggestionEngine._create_discount_suggestion(db, mock_hs, config)
                sug.reasoning = f"Unified Model Recommendation: Discount to move {an.classification.value} stock."
                suggestions.append(sug)
                db.add(sug)

        await db.flush()

        duration = round(time.time() - start, 3)

        summary = {
            "dead_stock_detected": dead_count,
            "slow_moving_detected": slow_count,
            "expiry_risk_detected": len(expiry),
            "low_stock_detected": len(low),
            "suggestions_generated": len(suggestions),
            "scan_duration_seconds": duration,
        }

        logger.info("Health scan complete: %s", summary)
        return summary
