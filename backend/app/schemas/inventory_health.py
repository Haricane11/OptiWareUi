"""Pydantic schemas for the Inventory Health Intelligence Module."""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────

class HealthTypeEnum(str, Enum):
    DEAD = "DEAD"
    SLOW = "SLOW"
    EXPIRY = "EXPIRY"


class SuggestionTypeEnum(str, Enum):
    DISCOUNT = "DISCOUNT"
    BUNDLE = "BUNDLE"
    DISPOSAL = "DISPOSAL"
    RETURN = "RETURN"


class SuggestionStatusEnum(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXECUTED = "EXECUTED"


# ── Health Status ─────────────────────────────────────────────────────

class HealthStatusItem(BaseModel):
    id: int
    product_id: int
    warehouse_id: int
    batch_id: Optional[int] = None
    health_type: HealthTypeEnum
    severity_score: float
    details: Optional[dict] = None
    detected_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    # UI Fields dynamically populated by service
    product_name: str | None = None
    sku: str | None = None
    shelf_code: str | None = None
    current_qty: int | None = None
    min_qty: int | None = None

    class Config:
        from_attributes = True


class HealthReportResponse(BaseModel):
    total_issues: int
    dead_stock_count: int
    slow_moving_count: int
    expiry_risk_count: int
    total_value_at_risk: float
    dead_stock_items: list[HealthStatusItem]
    slow_moving_items: list[HealthStatusItem]
    expiry_risk_items: list[HealthStatusItem]


# ── Action Suggestions ───────────────────────────────────────────────

class ActionSuggestionResponse(BaseModel):
    id: int
    product_id: int
    warehouse_id: int
    batch_id: Optional[int] = None
    health_status_id: Optional[int] = None
    suggestion_type: SuggestionTypeEnum
    reasoning: str
    severity_score: float
    suggested_discount_percent: Optional[float] = None
    linked_promotion_id: Optional[int] = None
    linked_bundle_id: Optional[int] = None
    status: SuggestionStatusEnum
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    # Enriched display fields (populated by service)
    product_name: Optional[str] = None
    sku: Optional[str] = None
    estimated_value: Optional[float] = None
    health_status_label: Optional[str] = None
    health_days: Optional[int] = None

    class Config:
        from_attributes = True


class ActionSuggestionListResponse(BaseModel):
    total: int
    suggestions: list[ActionSuggestionResponse]


class ApproveRejectRequest(BaseModel):
    approved_by: Optional[int] = None
    reason: Optional[str] = None


# ── Configuration ────────────────────────────────────────────────────

class ConfigResponse(BaseModel):
    id: int = 1
    dead_days_threshold: int = 90
    slow_turnover_threshold: float = 1.0
    expiry_warning_days: int = 30
    auto_discount_enabled: bool = False
    auto_bundle_enabled: bool = False
    max_discount_limit: float = 30.0
    low_risk_severity_threshold: float = 40.0
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ConfigUpdateRequest(BaseModel):
    dead_days_threshold: Optional[int] = Field(None, ge=1)
    slow_turnover_threshold: Optional[float] = Field(None, gt=0)
    expiry_warning_days: Optional[int] = Field(None, ge=1)
    auto_discount_enabled: Optional[bool] = None
    auto_bundle_enabled: Optional[bool] = None
    max_discount_limit: Optional[float] = Field(None, gt=0, le=100)
    low_risk_severity_threshold: Optional[float] = Field(None, ge=0, le=100)


# ── Manual Bundle ────────────────────────────────────────────────────

class ManualBundleItemInput(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class ManualBundleCreateRequest(BaseModel):
    bundle_name: str
    bundle_price: float = Field(gt=0)
    items: list[ManualBundleItemInput]
    linked_suggestion_id: Optional[int] = None


class ManualBundleResponse(BaseModel):
    id: int
    bundle_name: str
    bundle_price: float
    is_active: bool
    linked_suggestion_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Scan Result ──────────────────────────────────────────────────────

class ScanResultResponse(BaseModel):
    dead_stock_detected: int
    slow_moving_detected: int
    expiry_risk_detected: int
    suggestions_generated: int
    scan_duration_seconds: float

# ── Bundle Fetching ──────────────────────────────────────────────────

class BundleItemResponse(BaseModel):
    product_id: int
    product_name: str
    quantity: int

class BundleStatusUpdateRequest(BaseModel):
    is_active: bool

class BundleResponse(BaseModel):
    id: int
    bundle_name: str
    bundle_price: float
    is_active: bool
    created_at: Optional[datetime] = None
    items: list[BundleItemResponse]

    class Config:
        from_attributes = True

class BundleSaleResponse(BaseModel):
    id: int
    bundle_id: int
    bundle_name: str
    sales_order_id: int
    order_number: str
    quantity: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

