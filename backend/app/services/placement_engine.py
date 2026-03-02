"""
Automated Product Placement Engine
====================================
Finds the optimal shelf for a product using a 5-step priority:
  Step 1 – Zone/Shelf category must match the product category.
  Step 2 – Consolidate same-SKU where possible: place MULTIPLE units of the same SKU
            on the same shelf/bay until capacity is reached; then prefer smallest waste (Best-Fit).
  Step 3 – Turnover rate → aisle priority (high=low aisle, low=high aisle).
  Step 4 – Handling type → level priority.
  Step 5 – Bay priority: prefer smallest available bay number (B1 < B2 < B3 …).

Notes on fit calculation:
- Volume fit uses measured_width × measured_depth × measured_height for one unit.
- Weight fit uses measured_weight for one unit.
- The engine will attempt to place ALL requested quantity in one shelf first.
- If not possible, it will place as many as possible in the best matching shelf.
"""

from typing import Optional, Dict, Any, Tuple, List
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# --- Turnover aisle rank helper ------------------------------------------
# We resolve "medium" turnover at query time: we get the full sorted aisle
# list for each zone and pick the shelf whose aisle_num is nearest to the
# middle. A CASE in ORDER BY handles high/low; medium is a post-SQL pick.

HANDLING_LEVEL_PRIORITY = {
    # handling_type_lower -> list of preferred level_nums in priority order
    "fragile": [3, 4, 2, 5, 1, 6],
    "standard_heavy": [1, 2, 3, 4, 5, 6],
    "standard_light": [5, 6, 4, 3, 2, 1],
    "standard": [1, 2, 3, 4, 5, 6],   # fallback
}


def _handling_key(handling_type: Optional[str], weight: Optional[float]) -> str:
    """Resolve the handling key used for level priority lookup."""
    ht = (handling_type or "standard").lower()
    if ht == "fragile":
        return "fragile"
    if ht.startswith("standard"):
        # Heavy = weight > 20 kg (configurable threshold)
        if weight and weight > 20:
            return "standard_heavy"
        return "standard_light"
    return "standard"


def _build_level_case(handling_key: str) -> str:
    """
    Returns a SQL CASE expression that assigns a priority rank to level_num.
    Rank 1 = most preferred, higher = less preferred.
    """
    levels = HANDLING_LEVEL_PRIORITY.get(handling_key, HANDLING_LEVEL_PRIORITY["standard"])
    # Build: CASE WHEN level_num = X THEN 1 WHEN level_num = Y THEN 2 … ELSE 99 END
    whens = " ".join(
        f"WHEN s.level_num = {lvl} THEN {rank + 1}"
        for rank, lvl in enumerate(levels)
    )
    return f"CASE {whens} ELSE 99 END"


def match_shelf_in_memory(
    shelves: List[Dict[str, Any]],
    product: Dict[str, Any],
    quantity: int,
    measured_width: float = 0,
    measured_depth: float = 0,
    measured_height: float = 0,
    measured_weight: float = 0
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any], int]:
    """
    Core matching logic that operates on a list of shelf dictionaries in memory.
    Returns (chosen_shelf, failure_reasons, quantity_placed).
    Now attempts to place ALL quantity of same SKU in one shelf if capacity allows.
    """
    category = product.get("category")
    handling_type = product.get("handling_type")
    turnover_rate = (product.get("turnover_rate") or "medium").lower()

    total_volume = float(measured_width) * float(measured_depth) * float(measured_height)
    total_weight = float(measured_weight)

    reasons = {
        "category_mismatch": 0, 
        "insufficient_volume": 0, 
        "weight_limit_exceeded": 0, 
        "total_shelves_checked": len(shelves),
        "partial_fulfillment": False,
        "quantity_placed": 0
    }

    # If no shelves to check, return early
    if not shelves:
        logger.warning("No shelves available to check")
        return None, reasons, 0

    # Step 1: Filter by category with strict-first policy; fallback to null-category shelves
    strict_candidates = []
    null_candidates = []
    for s in shelves:
        try:
            shelf_category = s.get("product_category")
            avail_vol = float(s.get("available_volume") or 0)
            max_w = float(s.get("max_weight") or 0)
            curr_w = float(s.get("current_weight") or 0)

            if total_volume > 0 and avail_vol < total_volume:
                reasons["insufficient_volume"] += 1
                continue
            if total_weight > 0 and (max_w - curr_w) < total_weight:
                reasons["weight_limit_exceeded"] += 1
                continue

            if category and str(category).strip() != "":
                if shelf_category and str(shelf_category).strip() != "" and str(shelf_category).lower() == str(category).lower():
                    strict_candidates.append(s)
                elif not shelf_category or str(shelf_category).strip() == "":
                    null_candidates.append(s)
                else:
                    reasons["category_mismatch"] += 1
            else:
                if not shelf_category or str(shelf_category).strip() == "":
                    null_candidates.append(s)
                else:
                    reasons["category_mismatch"] += 1
        except (ValueError, TypeError) as e:
            logger.error(f"Error processing shelf {s.get('id')}: {e}")
            continue

    candidates = strict_candidates if strict_candidates else null_candidates

    if not candidates:
        logger.info("No candidates found after filtering")
        return None, reasons, 0

    # Step 2: Add sorting priority to shelf dicts
    handling_key = _handling_key(handling_type, total_weight)
    level_prio = HANDLING_LEVEL_PRIORITY.get(handling_key, HANDLING_LEVEL_PRIORITY["standard"])
    level_rank_map = {lvl: rank for rank, lvl in enumerate(level_prio)}

    for s in candidates:
        try:
            s["_cat_prio"] = 0 if s.get("product_category") and str(s.get("product_category")).lower() == str(category or "").lower() else 1
            s["_vol"] = float(s.get("available_volume") or 0)
            s["_lvl_rank"] = level_rank_map.get(s.get("level_num"), 99)
            s["_aisle"] = int(s.get("aisle_num") or 0)
            s["_bay"] = int(s.get("bay_num") or 0)
            
            # Calculate max units this shelf can hold (volume and weight based)
            rem_weight = float(s.get("max_weight") or 0) - float(s.get("current_weight") or 0)
            units_by_volume = int(s["_vol"] // total_volume) if total_volume > 0 else float("inf")
            units_by_weight = int(rem_weight // total_weight) if total_weight > 0 else float("inf")
            if total_volume > 0 and total_weight > 0:
                s["_max_units"] = int(min(units_by_volume, units_by_weight))
            elif total_volume > 0:
                s["_max_units"] = int(units_by_volume)
            elif total_weight > 0:
                s["_max_units"] = int(units_by_weight)
            else:
                s["_max_units"] = int(quantity)
        except (ValueError, TypeError, ZeroDivisionError) as e:
            logger.error(f"Error calculating capacity for shelf {s.get('id')}: {e}")
            s["_max_units"] = 0

    # Step 3: Sort by priority rules
    def sort_key(s):
        aisle_val = -s["_aisle"] if turnover_rate == "low" else s["_aisle"]
        return (s["_cat_prio"], s["_lvl_rank"], aisle_val, s["_bay"])

    candidates.sort(key=sort_key)

    # Step 4: Handle medium turnover median picks
    if turnover_rate == "medium" and candidates:
        try:
            # Narrow down to BEST category priority candidates
            best_cat_prio = candidates[0]["_cat_prio"]
            best_priority_candidates = [c for c in candidates if c["_cat_prio"] == best_cat_prio]
            
            aisles = sorted(list(set(c["_aisle"] for c in best_priority_candidates)))
            if len(aisles) >= 3:
                mid_aisle = aisles[len(aisles) // 2]
            elif len(aisles) == 2:
                mid_aisle = aisles[1]
            else:
                mid_aisle = aisles[0]
            
            # Filter to median aisle
            candidates = [c for c in best_priority_candidates if c["_aisle"] == mid_aisle]
        except (IndexError, KeyError) as e:
            logger.error(f"Error handling medium turnover: {e}")

    # Step 5: Find best shelf that can fit ALL quantity, else the most units
    if candidates:
        try:
            # First, try to find a shelf that can fit ALL units
            full_fillment_candidates = [c for c in candidates if c["_max_units"] >= quantity]
            
            if full_fillment_candidates:
                # Prefer consolidation (more remaining capacity) before best-fit waste
                best_shelf = max(
                    full_fillment_candidates,
                    key=lambda s: (s["_max_units"], -((s["_vol"] - total_volume))),
                )
                reasons["quantity_placed"] = quantity
                logger.info(f"Found shelf {best_shelf.get('shelf_code')} that can fit all {quantity} units")
                return best_shelf, reasons, quantity
            
            # If no shelf can fit ALL, find the one that can fit the MOST units
            # with best priority ranking
            max_units = max(c["_max_units"] for c in candidates)
            if max_units > 0:
                best_shelf = max(
                    candidates,
                    key=lambda s: (s["_max_units"], -((s["_vol"] - total_volume))),
                )
                placed = int(min(max_units, quantity))
                reasons["partial_fulfillment"] = placed < quantity
                reasons["quantity_placed"] = placed
                logger.info(f"Partial placement: {placed}/{quantity} units in shelf {best_shelf.get('shelf_code')}")
                return best_shelf, reasons, placed
        except (ValueError, KeyError) as e:
            logger.error(f"Error finding best shelf: {e}")

    return None, reasons, 0


def find_optimal_shelf(
    conn,
    product_id: int,
    quantity: int,
    warehouse_id: int,
    measured_width: float = 0,
    measured_depth: float = 0,
    measured_height: float = 0,
    measured_weight: float = 0
) -> Optional[Dict[str, Any]]:
    """
    Find optimal shelf for product placement.
    Returns shelf dictionary with placement information or None if no suitable shelf found.
    """
    cur = None
    try:
        cur = conn.cursor()
        
        # Get product details
        cur.execute(
            "SELECT category, handling_type, turnover_rate FROM products WHERE id = %s", 
            (product_id,)
        )
        product_row = cur.fetchone()
        
        if not product_row:
            logger.error(f"Product with ID {product_id} not found")
            return None
            
        # Convert row to dict
        product = {
            "category": product_row.get("category"),
            "handling_type": product_row.get("handling_type"),
            "turnover_rate": product_row.get("turnover_rate"),
        }

        # Get all active shelves in the warehouse
        cur.execute(
            """
            SELECT 
                s.id, 
                s.shelf_code, 
                s.aisle_num, 
                s.bay_num, 
                s.level_num, 
                s.bin_num, 
                s.max_weight, 
                s.current_weight, 
                CAST(s.available_volume AS FLOAT) AS available_volume,
                z.zone_name, 
                z.product_category
            FROM shelves s
            JOIN zones z ON s.zone_id = z.id
            JOIN floors f ON z.floor_id = f.id
            WHERE f.warehouse_id = %s AND s.status = 'active'
            ORDER BY s.aisle_num, s.bay_num, s.level_num
            """,
            (warehouse_id,)
        )
        shelf_rows = cur.fetchall()
        
        # Convert shelves to plain dicts
        shelves = [dict(row) for row in shelf_rows]
        
        logger.info(f"Found {len(shelves)} active shelves in warehouse {warehouse_id}")
        
        # Find optimal shelf
        shelf, reasons, quantity_placed = match_shelf_in_memory(
            shelves, product, quantity, 
            measured_width, measured_depth, measured_height, measured_weight
        )
        
        if shelf:
            # Add quantity placed information to the shelf dict
            # Normalize keys expected by API callers
            if "shelf_id" not in shelf and "id" in shelf:
                shelf["shelf_id"] = shelf["id"]
            shelf["quantity_placed"] = quantity_placed
            shelf["is_partial"] = reasons.get("partial_fulfillment", False)
            shelf["total_requested"] = quantity
            
            logger.info(f"Placement suggestion: {quantity_placed} units in shelf {shelf['shelf_code']}")
            return shelf
        
        logger.warning(f"No suitable shelf found for product {product_id}")
        return None
        
    except Exception as e:
        logger.error(f"Error in find_optimal_shelf: {e}", exc_info=True)
        return None
    finally:
        if cur:
            cur.close()


def find_optimal_shelf_for_multiple_items(
    conn,
    items: List[Dict[str, Any]],
    warehouse_id: int
) -> List[Dict[str, Any]]:
    """
    Find optimal shelves for multiple items (batch processing).
    Useful for the "Generate Placement Suggestions" button in your UI.
    
    Args:
        conn: Database connection
        items: List of items, each with product_id, quantity, dimensions, etc.
        warehouse_id: Warehouse ID
    
    Returns:
        List of placement suggestions
    """
    suggestions = []
    
    for item in items:
        try:
            shelf = find_optimal_shelf(
                conn,
                product_id=item['product_id'],
                quantity=item['quantity'],
                warehouse_id=warehouse_id,
                measured_width=item.get('width', 0),
                measured_depth=item.get('depth', 0),
                measured_height=item.get('height', 0),
                measured_weight=item.get('weight', 0)
            )
            
            if shelf:
                suggestions.append({
                    'sku': item.get('sku', 'Unknown'),
                    'shelf_code': shelf['shelf_code'],
                    'quantity_placed': shelf['quantity_placed'],
                    'total_requested': item['quantity'],
                    'is_partial': shelf['is_partial'],
                    'shelf_details': shelf
                })
            else:
                suggestions.append({
                    'sku': item.get('sku', 'Unknown'),
                    'error': 'No suitable shelf found',
                    'quantity': item['quantity']
                })
        except Exception as e:
            logger.error(f"Error processing item {item}: {e}")
            suggestions.append({
                'sku': item.get('sku', 'Unknown'),
                'error': str(e),
                'quantity': item.get('quantity', 0)
            })
    
    return suggestions


# Helper function to update shelf capacity after placement
def update_shelf_capacity(
    conn, 
    shelf_id: int, 
    quantity_placed: int, 
    unit_volume: float, 
    unit_weight: float
) -> bool:
    """
    Update shelf available_volume and current_weight after placing items.
    Call this function after confirming placement.
    """
    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE shelves 
            SET available_volume = available_volume - %s,
                current_weight = current_weight + %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (quantity_placed * unit_volume, quantity_placed * unit_weight, shelf_id)
        )
        conn.commit()
        success = cur.rowcount > 0
        if success:
            logger.info(f"Updated capacity for shelf {shelf_id}: -{quantity_placed} units")
        return success
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating shelf capacity: {e}")
        return False
    finally:
        if cur:
            cur.close()
