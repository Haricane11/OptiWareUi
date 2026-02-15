from fastapi import APIRouter, HTTPException
from ..database import get_conn
from ..models.schemas import LoginRequest

router = APIRouter()

@router.post("/login")
async def login(req: LoginRequest):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM users WHERE username = %s", (req.username,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Verify password (direct comparison as per original code, should eventually use hash)
        if not user.get('password'):
            raise HTTPException(status_code=401, detail="Password not set for this user")
        
        if not req.password == user['password']:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Remove password from response
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
        cur.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    finally:
        cur.close()
        conn.close()
