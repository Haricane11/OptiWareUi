from fastapi import APIRouter, HTTPException
from app.mongodb import get_conn
from app.models.schemas import CustomerCreate, CustomerUpdate
from typing import List, Optional

router = APIRouter(prefix="/customers", tags=["customers"])

@router.get("")
def list_customers():
    """List all customers."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        query = "SELECT * FROM customers ORDER BY id ASC;"
        cur.execute(query)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
def create_customer(customer: CustomerCreate):
    """Create a new customer."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO customers (
                customer_name, contact_person, email, phone, shipping_address, tax_id, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (
                customer.customer_name, customer.contact_person, customer.email,
                customer.phone, customer.shipping_address, customer.tax_id, customer.status
            )
        )
        customer_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"id": customer_id, **customer.dict()}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{customer_id}")
def update_customer(customer_id: int, customer: CustomerUpdate):
    """Update a customer."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        update_fields = []
        update_values = []
        
        if customer.customer_name is not None:
            update_fields.append("customer_name = %s")
            update_values.append(customer.customer_name)
        if customer.contact_person is not None:
            update_fields.append("contact_person = %s")
            update_values.append(customer.contact_person)
        if customer.email is not None:
            update_fields.append("email = %s")
            update_values.append(customer.email)
        if customer.phone is not None:
            update_fields.append("phone = %s")
            update_values.append(customer.phone)
        if customer.shipping_address is not None:
            update_fields.append("shipping_address = %s")
            update_values.append(customer.shipping_address)
        if customer.tax_id is not None:
            update_fields.append("tax_id = %s")
            update_values.append(customer.tax_id)
        if customer.status is not None:
            update_fields.append("status = %s")
            update_values.append(customer.status)

        if not update_fields:
            return {"message": "No fields to update"}

        query = "UPDATE customers SET " + ", ".join(update_fields) + " WHERE id = %s RETURNING id;"
        update_values.append(customer_id)
        
        cur.execute(query, tuple(update_values))
        updated_id = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        if not updated_id:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"message": "Customer updated successfully", "id": customer_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{customer_id}")
def delete_customer(customer_id: int):
    """Delete a customer."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM customers WHERE id = %s RETURNING id;", (customer_id,))
        deleted_id = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        if not deleted_id:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"message": "Customer deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
