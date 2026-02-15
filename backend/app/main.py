from fastapi.middleware.cors import CORSMiddleware

from app.routers.purchase_invoices import router as purchase_invoices_router
from app.routers.suppliers import router as suppliers_router
from app.routers.purchase_orders import router as purchase_orders_router
from app.routers.products import router as products_router
from app.routers.warehouses import router as warehouses_router
from app.routers.auth import router as auth_router
from app.routers.floors import router as floors_router
from app.routers.zones import router as zones_router
from app.routers.shelves import router as shelves_router
from app.routers.areas import router as areas_router

from fastapi import FastAPI
from dotenv import load_dotenv

from app.database import mongodb

load_dotenv()  # loads backend/.env

app = FastAPI(title="WMS Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(purchase_invoices_router)
app.include_router(suppliers_router)
app.include_router(purchase_orders_router)
app.include_router(products_router)
app.include_router(warehouses_router)
app.include_router(auth_router)
app.include_router(floors_router)
app.include_router(zones_router)
app.include_router(shelves_router)
app.include_router(areas_router)

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
def root():
    return {"message": "Backend running successfully 🚀"}
