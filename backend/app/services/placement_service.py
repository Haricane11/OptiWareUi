"""
Placement Service — Warehouse capacity validation and optimal shelf selection.

Validates:
  - Volume capacity
  - Weight capacity
  - Temperature compatibility
  - Hazardous constraints

Placement algorithm selects the optimal shelf considering available space.
Fails the transaction if any constraint is violated.
"""

import logging
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.warehouse import Shelf
from app.models.products import Product
from app.models.inventory import Inventory
from app.models.receipt import ReceiptItem
from app.models.placement import PlacementSuggestion
from app.core.exceptions import (
    CapacityExceededError,
    IncompatibleShelfError,
    EntityNotFoundError,
)

logger = logging.getLogger(__name__)


class PlacementService:

    @staticmethod
    async def validate_shelf_capacity(
        shelf: Shelf,
        additional_weight: float,
        additional_volume: float,
    ) -> None:
        """Raise CapacityExceededError if adding would exceed shelf limits."""
        current_weight = float(shelf.current_weight or 0)
        max_weight = float(shelf.max_weight or 0)
        if max_weight > 0 and (current_weight + additional_weight) > max_weight:
            raise CapacityExceededError(
                shelf.id,
                f"Weight: {current_weight + additional_weight:.2f} > max {max_weight:.2f}",
            )

        used_volume = float(shelf.used_volume or 0)
        total_volume = float(shelf.volume or 0)
        if total_volume > 0 and (used_volume + additional_volume) > total_volume:
            raise CapacityExceededError(
                shelf.id,
                f"Volume: {used_volume + additional_volume:.3f} > max {total_volume:.3f}",
            )

    @staticmethod
    async def validate_compatibility(shelf: Shelf, product: Product) -> None:
        """Validate temperature zone and hazardous flag compatibility."""
        # Temperature check
        if product.storage_temperature and shelf.temperature_zone:
            if product.storage_temperature != shelf.temperature_zone:
                raise IncompatibleShelfError(
                    shelf.id,
                    f"Temperature mismatch: product requires '{product.storage_temperature}' "
                    f"but shelf zone is '{shelf.temperature_zone}'",
                )

        # Hazardous check
        if product.handling_type == "HAZARDOUS" and not shelf.can_store_hazardous:
            raise IncompatibleShelfError(
                shelf.id,
                "Shelf cannot store hazardous products",
            )

    @staticmethod
    async def suggest_placement(
        db: AsyncSession,
        receipt_item_id: int,
    ) -> list[dict]:
        """
        Find optimal shelves for a receipt item.
        Algorithm: score shelves by available capacity, temperature match, and proximity.
        Returns a ranked list of suggestions.
        """
        # Load receipt item and product
        ri_stmt = select(ReceiptItem).where(ReceiptItem.id == receipt_item_id)
        ri_result = await db.execute(ri_stmt)
        receipt_item = ri_result.scalar_one_or_none()
        if not receipt_item:
            raise EntityNotFoundError("ReceiptItem", receipt_item_id)

        prod_stmt = select(Product).where(Product.id == receipt_item.product_id)
        prod_result = await db.execute(prod_stmt)
        product = prod_result.scalar_one_or_none()
        if not product:
            raise EntityNotFoundError("Product", receipt_item.product_id)

        unit_weight = float(product.weight or 0)
        unit_volume = float(product.volume or 0)
        total_weight = unit_weight * receipt_item.received_qty
        total_volume = unit_volume * receipt_item.received_qty

        # Find candidate shelves with enough capacity
        shelf_stmt = (
            select(Shelf)
            .where(Shelf.status == "ACTIVE")
            .with_for_update(skip_locked=True)
        )
        shelf_result = await db.execute(shelf_stmt)
        shelves = shelf_result.scalars().all()

        suggestions = []
        for shelf in shelves:
            score = 0.0

            # Weight check
            avail_weight = float(shelf.max_weight or 0) - float(shelf.current_weight or 0)
            if float(shelf.max_weight or 0) > 0 and total_weight > avail_weight:
                continue

            # Volume check
            avail_volume = float(shelf.volume or 0) - float(shelf.used_volume or 0)
            if float(shelf.volume or 0) > 0 and total_volume > avail_volume:
                continue

            # Temperature compatibility
            temp_match = True
            if product.storage_temperature and shelf.temperature_zone:
                if product.storage_temperature != shelf.temperature_zone:
                    temp_match = False
                    continue
                score += 0.3

            # Hazardous compatibility
            if product.handling_type == "HAZARDOUS" and not shelf.can_store_hazardous:
                continue

            # Score: prefer shelves with tighter fit (less wasted space)
            if float(shelf.volume or 0) > 0:
                fill_ratio = total_volume / float(shelf.volume)
                score += fill_ratio * 0.4

            # Category match bonus
            if shelf.product_category and product.category:
                if shelf.product_category == product.category:
                    score += 0.3

            suggestions.append({
                "shelf_id": shelf.id,
                "shelf_code": shelf.shelf_code,
                "fitness_score": round(score, 3),
                "available_weight": avail_weight,
                "available_volume": avail_volume,
            })

        # Sort by fitness score descending
        suggestions.sort(key=lambda s: s["fitness_score"], reverse=True)

        # Save top suggestions to DB
        for sug in suggestions[:5]:
            db.add(PlacementSuggestion(
                receipt_item_id=receipt_item_id,
                shelf_id=sug["shelf_id"],
                algorithm="BEST_FIT_V1",
                fitness_score=Decimal(str(sug["fitness_score"])),
                suggested_qty=receipt_item.received_qty,
                status="SUGGESTED",
            ))
        await db.flush()

        return suggestions[:5]

    @staticmethod
    async def execute_placement(
        db: AsyncSession,
        receipt_item_id: int,
        shelf_id: int,
        qty: int,
    ) -> dict:
        """
        Place qty units of a receipt item onto a shelf.
        Validates capacity and compatibility, then atomically updates
        shelf weight/volume and inventory assignment.
        """
        # Lock shelf
        shelf_stmt = select(Shelf).where(Shelf.id == shelf_id).with_for_update()
        shelf_result = await db.execute(shelf_stmt)
        shelf = shelf_result.scalar_one_or_none()
        if not shelf:
            raise EntityNotFoundError("Shelf", shelf_id)

        # Load receipt item
        ri_stmt = select(ReceiptItem).where(ReceiptItem.id == receipt_item_id).with_for_update()
        ri_result = await db.execute(ri_stmt)
        receipt_item = ri_result.scalar_one_or_none()
        if not receipt_item:
            raise EntityNotFoundError("ReceiptItem", receipt_item_id)

        # Load product
        prod_stmt = select(Product).where(Product.id == receipt_item.product_id)
        prod_result = await db.execute(prod_stmt)
        product = prod_result.scalar_one_or_none()
        if not product:
            raise EntityNotFoundError("Product", receipt_item.product_id)

        unit_weight = float(product.weight or 0)
        unit_volume = float(product.volume or 0)
        add_weight = unit_weight * qty
        add_volume = unit_volume * qty

        # Validate
        await PlacementService.validate_shelf_capacity(shelf, add_weight, add_volume)
        await PlacementService.validate_compatibility(shelf, product)

        # Update shelf
        shelf.current_weight = Decimal(str(float(shelf.current_weight or 0) + add_weight))
        shelf.used_volume = Decimal(str(float(shelf.used_volume or 0) + add_volume))
        shelf.available_volume = Decimal(str(
            float(shelf.volume or 0) - float(shelf.used_volume)
        ))

        # Update receipt item
        receipt_item.assigned_shelf_id = shelf_id
        receipt_item.placed_qty = (receipt_item.placed_qty or 0) + qty
        if receipt_item.placed_qty >= receipt_item.received_qty:
            receipt_item.placement_status = "PLACED"
        else:
            receipt_item.placement_status = "PARTIAL"

        # Update inventory batch shelf assignment
        inv_stmt = (
            select(Inventory)
            .where(
                Inventory.product_id == receipt_item.product_id,
                Inventory.batch_number == receipt_item.batch_number,
                Inventory.shelf_id.is_(None),
            )
            .with_for_update()
        )
        inv_result = await db.execute(inv_stmt)
        inv_batch = inv_result.scalar_one_or_none()
        if inv_batch:
            inv_batch.shelf_id = shelf_id

        await db.flush()
        logger.info(
            "Placed %d units of receipt item %d on shelf %d",
            qty, receipt_item_id, shelf_id,
        )
        return {
            "receipt_item_id": receipt_item_id,
            "shelf_id": shelf_id,
            "placed_qty": qty,
            "placement_status": receipt_item.placement_status,
        }
