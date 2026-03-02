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
            SELECT u.*, z.zone_name, f.floor_number 
            FROM users u
            LEFT JOIN zones z ON u.zone_id = z.id
            LEFT JOIN floors f ON z.floor_id = f.id
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
            SELECT u.*, z.zone_name, f.floor_number 
            FROM users u
            LEFT JOIN zones z ON u.zone_id = z.id
            LEFT JOIN floors f ON z.floor_id = f.id
            WHERE u.username = %s
        """, (username,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    finally:
        cur.close()
        conn.close()
