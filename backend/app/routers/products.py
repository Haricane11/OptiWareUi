from fastapi import APIRouter, HTTPException
from app.mongodb import get_conn
from app.models.schemas import ProductCreate, ProductUpdate
from typing import List, Optional

router = APIRouter(prefix="/products", tags=["products"])

@router.get("")
def list_products(status: Optional[str] = None):
    """List all products, optionally filtered by status."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        query = """
            SELECT id, sku, name, category, supplier_id, supplier_sku, upc_code,
                   handling_type, storage_temperature, unit_price, turnover_rate, status, created_at
            FROM products
        """
        params = []
        if status:
            query += " WHERE status = %s"
            params.append(status)
        query += " ORDER BY id ASC;"
        
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        for r in rows:
            r["unit_price"] = float(r.get("unit_price") or 0)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
def create_product(product: ProductCreate):
    """Create a new product."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO products (
                sku, name, category, supplier_id, supplier_sku, upc_code,
                handling_type, storage_temperature, unit_price, turnover_rate, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                product.sku, product.name, product.category, product.supplier_id,
                product.supplier_sku, product.upc_code,
                product.handling_type, product.storage_temperature,
                product.unit_price, product.turnover_rate, product.status,
            )
        )
        product_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"id": product_id, **product.dict()}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{product_id}")
def update_product(product_id: int, product: ProductUpdate):
    """Update an existing product."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Build dynamic update query
        update_fields = []
        update_values = []
        
        if product.sku is not None:
            update_fields.append("sku = %s")
            update_values.append(product.sku)
        if product.name is not None:
            update_fields.append("name = %s")
            update_values.append(product.name)
        if product.category is not None:
            update_fields.append("category = %s")
            update_values.append(product.category)
        if "supplier_id" in product.__fields_set__:
            update_fields.append("supplier_id = %s")
            update_values.append(product.supplier_id)
        if product.supplier_sku is not None:
            update_fields.append("supplier_sku = %s")
            update_values.append(product.supplier_sku)
        if product.upc_code is not None:
            update_fields.append("upc_code = %s")
            update_values.append(product.upc_code)
        if "handling_type" in product.__fields_set__:
            update_fields.append("handling_type = %s")
            update_values.append(product.handling_type)
        if "storage_temperature" in product.__fields_set__:
            update_fields.append("storage_temperature = %s")
            update_values.append(product.storage_temperature)
        if product.unit_price is not None:
            update_fields.append("unit_price = %s")
            update_values.append(product.unit_price)
        if product.turnover_rate is not None:
            update_fields.append("turnover_rate = %s")
            update_values.append(product.turnover_rate)
        if product.status is not None:
            update_fields.append("status = %s")
            update_values.append(product.status)

        if not update_fields:
            return {"message": "No fields to update"}

        query = "UPDATE products SET " + ", ".join(update_fields) + " WHERE id = %s RETURNING id;"
        update_values.append(product_id)
        
        cur.execute(query, tuple(update_values))
        updated_id = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        if not updated_id:
            raise HTTPException(status_code=404, detail="Product not found")
        return {"message": "Product updated successfully", "id": product_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{product_id}")
def delete_product(product_id: int):
    """Delete a product.
    As requested, this will also delete associated purchase orders.
    """
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("BEGIN;")

        # 1. Find all purchase_order_ids associated with this product
        cur.execute("SELECT DISTINCT purchase_order_id FROM purchase_order_items WHERE product_id = %s;", (product_id,))
        po_ids = [row['purchase_order_id'] for row in cur.fetchall()]

        if po_ids:
            # 2. Delete all items for these purchase orders
            cur.execute("DELETE FROM purchase_order_items WHERE purchase_order_id = ANY(%s);", (po_ids,))
            
            # 3. Delete the purchase orders themselves
            cur.execute("DELETE FROM purchase_orders WHERE id = ANY(%s);", (po_ids,))

        # 4. Delete the product items (in case there are other associations)
        cur.execute("DELETE FROM purchase_order_items WHERE product_id = %s;", (product_id,))

        # 5. Finally delete the product
        cur.execute("DELETE FROM products WHERE id = %s RETURNING id;", (product_id,))
        deleted_id = cur.fetchone()

        cur.execute("COMMIT;")
        cur.close()
        conn.close()
        if not deleted_id:
            raise HTTPException(status_code=404, detail="Product not found")
        return {"message": "Product and associated purchase orders deleted successfully"}
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
