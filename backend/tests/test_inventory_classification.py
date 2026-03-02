import pytest
import math
from app.services.inventory_classification_service import InventoryClassificationService
from app.models.inventory_health_analytics import HealthClassification, RecommendedAction

class TestInventoryClassificationRulesV2:
    """Unit tests for the advanced V2 deterministic classification logic."""

    def test_calculate_severity_log_scaling(self):
        config = {"weight_days": 0.4, "weight_overstock": 0.4, "weight_velocity": 0.2}
        
        # Dead stock edge: High days, huge overstock, 0 velocity
        score = InventoryClassificationService._calculate_severity(
            days_since_last_sale=200, overstock_ratio=10.0, normalized_velocity=0.0, config=config
        )
        # 0.4 * log1p(200) [~2.12] + 0.4 * 10.0 [4.0] + 0.2 * 1.0 [0.2] = ~6.32
        assert score > 2.0
        
        # Healthy stock: 5 days, low overstock, max velocity
        score = InventoryClassificationService._calculate_severity(
            days_since_last_sale=5, overstock_ratio=0.5, normalized_velocity=1.0, config=config
        )
        assert score < 1.0
        
    def test_margin_action_override(self):
        # High margin SLOW -> BUNDLE
        action = InventoryClassificationService._determine_action_with_margin(
            HealthClassification.SLOW_MOVING, unit_price=100.0, cost=50.0 # 50% margin
        )
        assert action == RecommendedAction.BUNDLE
        
        # Low margin SLOW -> DISPOSAL
        action = InventoryClassificationService._determine_action_with_margin(
            HealthClassification.SLOW_MOVING, unit_price=100.0, cost=90.0 # 10% margin
        )
        assert action == RecommendedAction.DISPOSAL
        
        # Mid margin SLOW -> NONE
        action = InventoryClassificationService._determine_action_with_margin(
            HealthClassification.SLOW_MOVING, unit_price=100.0, cost=70.0 # 30% margin
        )
        assert action == RecommendedAction.NONE

        # HEALTHY ignores margin
        action = InventoryClassificationService._determine_action_with_margin(
            HealthClassification.HEALTHY, unit_price=100.0, cost=50.0
        )
        assert action == RecommendedAction.NONE

        # DEAD ignores margin positive outcome
        action = InventoryClassificationService._determine_action_with_margin(
            HealthClassification.DEAD, unit_price=100.0, cost=10.0
        )
        assert action == RecommendedAction.DISPOSAL
        
    def test_determine_action_margin_zero_price(self):
        # Division by zero protection
        action = InventoryClassificationService._determine_action_with_margin(
            HealthClassification.SLOW_MOVING, unit_price=0.0, cost=50.0
        )
        assert action == RecommendedAction.NONE # Zero margin triggered default NONE
