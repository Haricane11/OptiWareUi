from fastapi import APIRouter, HTTPException
from ..mongodb import get_conn
from ..models.schemas import LoginRequest

router = APIRouter()

@router.post("/login")
async def login(req: LoginRequest):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.*, w.name as warehouse_name 
            FROM users u
            LEFT JOIN warehouses w ON u.warehouse_id = w.id
            WHERE u.username = %s
        """, (req.username,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        if not user.get('password'):
            raise HTTPException(status_code=401, detail="Password not set for this user")
        
        if not req.password == user['password']:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        user_data = dict(user)
        user_data.pop('password', None)
        return user_data
    finally:
        cur.close()
        conn.close()

@router.get("/me")
async def get_me(username: str):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.*, w.name as warehouse_name 
            FROM users u
            LEFT JOIN warehouses w ON u.warehouse_id = w.id
            WHERE u.username = %s
        """, (username,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    finally:
        cur.close()
        conn.close()
