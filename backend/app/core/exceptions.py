"""Domain-specific exceptions for the WMS backend."""

from fastapi import Request
from fastapi.responses import JSONResponse


# ── Base ──────────────────────────────────────────────────────────────
class WMSError(Exception):
    """Root exception for all WMS domain errors."""
    status_code: int = 500

    def __init__(self, detail: str = "Internal server error"):
        self.detail = detail
        super().__init__(self.detail)


# ── Inventory ─────────────────────────────────────────────────────────
class InsufficientStockError(WMSError):
    status_code = 409

    def __init__(self, product_id: int, requested: int, available: int):
        super().__init__(
            f"Insufficient stock for product {product_id}: "
            f"requested={requested}, available={available}"
        )
        self.product_id = product_id
        self.requested = requested
        self.available = available


class NegativeQuantityError(WMSError):
    status_code = 400

    def __init__(self, detail: str = "Quantity must be positive"):
        super().__init__(detail)


# ── State Machine ─────────────────────────────────────────────────────
class InvalidStateTransitionError(WMSError):
    status_code = 409

    def __init__(self, entity: str, current_status: str, target_status: str):
        super().__init__(
            f"{entity} cannot transition from '{current_status}' to '{target_status}'"
        )


# ── Warehouse / Placement ────────────────────────────────────────────
class CapacityExceededError(WMSError):
    status_code = 409

    def __init__(self, shelf_id: int, constraint: str):
        super().__init__(
            f"Shelf {shelf_id} capacity exceeded: {constraint}"
        )


class IncompatibleShelfError(WMSError):
    status_code = 409

    def __init__(self, shelf_id: int, reason: str):
        super().__init__(
            f"Shelf {shelf_id} is incompatible: {reason}"
        )


# ── Generic ───────────────────────────────────────────────────────────
class EntityNotFoundError(WMSError):
    status_code = 404

    def __init__(self, entity: str, entity_id: int | str):
        super().__init__(f"{entity} with id={entity_id} not found")


class DuplicateOperationError(WMSError):
    status_code = 409

    def __init__(self, detail: str = "Duplicate operation detected"):
        super().__init__(detail)


# ── FastAPI exception handler ─────────────────────────────────────────
async def wms_exception_handler(_request: Request, exc: WMSError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
