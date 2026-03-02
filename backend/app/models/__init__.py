"""Export all models so SQLAlchemy sees them for metadata.create_all."""

from .warehouse import Warehouse, Floor, Area, Zone, Shelf, ShelfType  # noqa: F401
from .supplier import Supplier  # noqa: F401
from .customer import Customer  # noqa: F401
from .user import User  # noqa: F401
from .products import Product  # noqa: F401
from .reorder_policy import ReorderPolicy  # noqa: F401
from .inventory import Inventory  # noqa: F401
from .orders import SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem  # noqa: F401
from .purchase import PurchaseOrder, PurchaseOrderItem  # noqa: F401
from .receipt import Receipt, ReceiptItem  # noqa: F401
from .placement import PlacementSuggestion  # noqa: F401
from .promotion import Promotion  # noqa: F401
from .bundle import Bundle, BundleItem
from .demand_analytics import ProductDemandAnalytics  # noqa: F401
from .logistics_metrics import ProductLogisticsMetrics  # noqa: F401
from .inventory_health import (  # noqa: F401
    InventoryHealthStatus,
    InventoryActionSuggestion,
    InventoryOptimizationConfig,
)
from .inventory_health_analytics import InventoryHealthAnalytics  # noqa: F401
