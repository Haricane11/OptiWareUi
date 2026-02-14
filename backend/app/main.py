from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.suppliers import router as suppliers_router
from app.routes.purchase_orders import router as purchase_orders_router
from app.routes.products import router as products_router
from app.routes.warehouses import router as warehouses_router


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(suppliers_router)
app.include_router(purchase_orders_router)
app.include_router(products_router)
app.include_router(warehouses_router)



@app.get("/")
def root():
    return {"message": "Backend running successfully 🚀"}
