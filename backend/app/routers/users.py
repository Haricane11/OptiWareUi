from fastapi import APIRouter, HTTPException
from typing import List, Optional
from ..mongodb import get_conn
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/users", tags=["users"])

class UserOut(BaseModel):
    id: int
    username: str
    role: str
    warehouse_id: Optional[int] = None
    status: str
    created_at: Optional[datetime] = None

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "staff"
    warehouse_id: Optional[int] = None
    status: str = "active"

class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    warehouse_id: Optional[int] = None
    status: Optional[str] = None

@router.get("", response_model=List[UserOut])
def list_users():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, username, role, warehouse_id, status, created_at
            FROM users
            WHERE role = 'staff'
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=UserOut)
def create_user(payload: UserCreate):
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO users (username, password, role, warehouse_id, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, username, role, warehouse_id, status, created_at;
            """,
            (payload.username, payload.password, payload.role, payload.warehouse_id, payload.status)
        )
        new_user = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return new_user
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate):
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        update_fields = []
        params = []
        
        if payload.username is not None:
            update_fields.append("username = %s")
            params.append(payload.username)
        if payload.password is not None:
            update_fields.append("password = %s")
            params.append(payload.password)
        if payload.role is not None:
            update_fields.append("role = %s")
            params.append(payload.role)
        if payload.warehouse_id is not None:
            update_fields.append("warehouse_id = %s")
            params.append(payload.warehouse_id)
        if payload.status is not None:
            update_fields.append("status = %s")
            params.append(payload.status)
            
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
            
        params.append(user_id)
        cur.execute(
            f"UPDATE users SET {', '.join(update_fields)} WHERE id = %s RETURNING id, username, role, warehouse_id, status, created_at;",
            tuple(params)
        )
        updated_user = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")
        return updated_user
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{user_id}")
def delete_user(user_id: int):
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE id = %s RETURNING id;", (user_id,))
        deleted_id = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not deleted_id:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
