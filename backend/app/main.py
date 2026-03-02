"""
WMS Backend — FastAPI Application Entry Point.

Registers all routers, exception handlers, CORS middleware,
and creates database tables on startup.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base
from app.core.exceptions import WMSError, wms_exception_handler

# Import all models so they are registered with Base.metadata
import app.models  # noqa: F401

from app.routers.inventory import router as inventory_router
from app.routers.sales import router as sales_router
from app.routers.purchase import router as purchase_router
from app.routers.warehouse import router as warehouse_router
from app.routers.receipt import router as receipt_router
from app.routers.reorder import router as reorder_router
from app.routers.analytics import router as analytics_router
from app.routers.inventory_health import router as inventory_health_router
from app.routers.inventory_classification import router as inventory_classification_router
from app.routers.demand_analysis import router as demand_analysis_router
from app.routers.auth import router as auth_router
from app.routers.floors import router as floors_router
from app.routers.zones import router as zones_router
from app.routers.shelves import router as shelves_router
from app.routers.areas import router as areas_router
from app.routers.customers import router as customers_router
from app.routers.users import router as users_router
from app.routers.qr_scan import router as qr_scan_router
from app.routers.scanned_items import router as scanned_items_router
from app.routers.notifications import router as notifications_router
from app.routers.suppliers import router as suppliers_router
from app.routers.products import router as products_router
from app.routers.warehouses import router as warehouses_router
from app.routers.receiving import router as receiving_router
from app.routers.delivery_notes import router as delivery_notes_router
from app.routers.purchase_invoices import router as purchase_invoices_router
from app.routers.purchase_orders import router as purchase_orders_router
from app.routers.sales_orders import router as sales_orders_router
from app.mongodb import mongodb

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create all tables. Shutdown: dispose engine."""
    mongodb.connect()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created.")
    yield
    await engine.dispose()
    logger.info("Database engine disposed.")
    mongodb.close()


app = FastAPI(
    title="OptiWare WMS",
    description="Production-grade Warehouse Management System API",
    version="2.0.0",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ───────────────────────────────────────────────
app.add_exception_handler(WMSError, wms_exception_handler)

# ── Routers ──────────────────────────────────────────────────────────
app.include_router(warehouse_router)
app.include_router(inventory_router)
app.include_router(sales_router)
app.include_router(purchase_router)
app.include_router(receipt_router)
app.include_router(reorder_router)
app.include_router(analytics_router)
app.include_router(inventory_health_router)
app.include_router(inventory_classification_router)
app.include_router(demand_analysis_router)
app.include_router(auth_router)
app.include_router(floors_router)
app.include_router(zones_router)
app.include_router(shelves_router)
app.include_router(areas_router)
app.include_router(customers_router)
app.include_router(users_router)
app.include_router(qr_scan_router)
app.include_router(scanned_items_router)
app.include_router(notifications_router)
app.include_router(suppliers_router)
app.include_router(products_router)
app.include_router(warehouses_router)
app.include_router(receiving_router)
app.include_router(delivery_notes_router)
app.include_router(purchase_invoices_router)
app.include_router(purchase_orders_router)
app.include_router(sales_orders_router)

@app.on_event("startup")
def on_startup() -> None:
    mongodb.connect()

@app.on_event("shutdown")
def on_shutdown() -> None:
    mongodb.close()

@app.get("/health/db")
async def health_db():
    # Simple ping to verify Atlas connection
    await mongodb.db.command("ping")
    return {"status": "ok", "db": "connected"}


@app.get("/")
async def root():
    return {"service": "OptiWare WMS", "version": "2.0.0", "status": "running"}
