import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
import bcrypt

app = FastAPI()

# Enable CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection configuration
# Replace with your actual database credentials
DB_CONFIG = {
    "host": "localhost",
    "database": "OptiWareWMS",
    "user": "postgres",
    "password": "yngWIE500!",
    "port": "5432"
}

def get_db_connection():
    # RealDictCursor allows us to get results as dictionaries (JSON-ready)
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    """Hash a password for storing."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Pydantic Models for Schema Alignment
class ShelfCreate(BaseModel):
    shelf_code: str
    shelf_type: str
    aisle_num: int
    bay_num: int
    level_num: int
    bin_num: Optional[int] = None
    width: float
    depth: float
    height: float
    location_x: float
    location_y: float
    location_z: float
    max_weight: Optional[float] = None
    status: Optional[str] = "active"

class ZoneCreate(BaseModel):
    zone_name: str
    zone_type: str
    width: float
    depth: float
    location_x: float
    location_y: float
    shelves: Optional[List[ShelfCreate]] = []

class AreaCreate(BaseModel):
    area_name: str
    width: float
    height: float
    depth: float
    location_x: float
    location_y: float
    area_type: Optional[str] = 'PATHWAY' # 'PATHWAY', 'OPERATIONAL', 'OBSTACLE'
    usage_category: Optional[str] = 'HUMAN_ONLY' # 'HUMAN_ONLY', 'FORKLIFT_LANE', 'PACKING_STATION', 'DOCK_DOOR'
    is_passable: Optional[bool] = True

class ShelfUpdate(BaseModel):
    shelf_code: Optional[str] = None
    shelf_type: Optional[str] = None
    width: Optional[float] = None
    depth: Optional[float] = None
    height: Optional[float] = None
    location_x: Optional[float] = None
    location_y: Optional[float] = None
    location_z: Optional[float] = None
    orientation_angle: Optional[float] = None
    max_weight: Optional[float] = None
    status: Optional[str] = None

class ZoneUpdate(BaseModel):
    zone_name: Optional[str] = None
    zone_type: Optional[str] = None
    width: Optional[float] = None
    depth: Optional[float] = None
    location_x: Optional[float] = None
    location_y: Optional[float] = None

class ZoneMove(BaseModel):
    location_x: float
    location_y: float

class AreaUpdate(BaseModel):
    area_name: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    location_x: Optional[float] = None
    location_y: Optional[float] = None
    area_type: Optional[str] = None
    usage_category: Optional[str] = None
    is_passable: Optional[bool] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class FloorCreate(BaseModel):
    floor_number: int
    areas: Optional[List[AreaCreate]] = []
    zones: Optional[List[ZoneCreate]] = []

class WarehouseCreate(BaseModel):
    name: str
    location: Optional[str] = None
    width: float
    height: float
    depth: float
    status: str
    created_by: int
    floors: List[FloorCreate]

@app.post("/login")
async def login(req: LoginRequest):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM users WHERE username = %s", (req.username,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Verify password
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

@app.get("/me")
async def get_me(username: str):
    conn = get_db_connection()
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


class WarehouseUpdate(BaseModel):
    name: str
    location: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    num_floors: Optional[int] = None

@app.put("/warehouses/{warehouse_id}")
async def update_warehouse(warehouse_id: int, w: WarehouseUpdate, current_user_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Check ownership
        cur.execute("SELECT created_by FROM warehouses WHERE id = %s", (warehouse_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        if row['created_by'] != current_user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this warehouse")

        # Build dynamic update query for provided fields
        update_fields = []
        update_values = []
        
        if w.name is not None:
            update_fields.append("name = %s")
            update_values.append(w.name)
        if w.location is not None:
            update_fields.append("location = %s")
            update_values.append(w.location)
        if w.width is not None:
            update_fields.append("width = %s")
            update_values.append(w.width)
        if w.height is not None:
            update_fields.append("height = %s")
            update_values.append(w.height)
        if w.depth is not None:
            update_fields.append("depth = %s")
            update_values.append(w.depth)
        
        if not update_fields:
            return {"status": "success", "message": "No fields to update"}
        
        update_values.append(warehouse_id)
        query = f"UPDATE warehouses SET {', '.join(update_fields)} WHERE id = %s"
        cur.execute(query, update_values)
        
        # Handle floor count changes
        if w.num_floors is not None:
            # Get current floor count
            cur.execute("SELECT COUNT(*) as count FROM floors WHERE warehouse_id = %s", (warehouse_id,))
            current_count = cur.fetchone()['count']
            
            if w.num_floors > current_count:
                # Add new floors
                for i in range(current_count, w.num_floors):
                    cur.execute(
                        "INSERT INTO floors (warehouse_id, floor_number) VALUES (%s, %s)",
                        (warehouse_id, i)
                    )
            elif w.num_floors < current_count:
                # Remove excess floors (delete from highest floor_number down)
                # First, get the floor IDs that will be deleted
                cur.execute(
                    "SELECT id FROM floors WHERE warehouse_id = %s AND floor_number >= %s",
                    (warehouse_id, w.num_floors)
                )
                floors_to_delete = [row['id'] for row in cur.fetchall()]
                
                if floors_to_delete:
                    # Delete in proper order to respect foreign key constraints
                    for floor_id in floors_to_delete:
                        # 1. Get all zones on this floor
                        cur.execute("SELECT id FROM zones WHERE floor_id = %s", (floor_id,))
                        zone_ids = [row['id'] for row in cur.fetchall()]
                        
                        # 2. Delete all shelves in these zones
                        if zone_ids:
                            cur.execute(
                                f"DELETE FROM shelves WHERE zone_id IN ({','.join(['%s'] * len(zone_ids))})",
                                zone_ids
                            )
                        
                        # 3. Delete all zones on this floor
                        cur.execute("DELETE FROM zones WHERE floor_id = %s", (floor_id,))
                        
                        # 4. Delete all areas on this floor
                        cur.execute("DELETE FROM areas WHERE floor_id = %s", (floor_id,))
                    
                    # 5. Finally, delete the floors themselves
                    cur.execute(
                        "DELETE FROM floors WHERE warehouse_id = %s AND floor_number >= %s",
                        (warehouse_id, w.num_floors)
                    )
        
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
@app.post("/warehouses")
async def create_warehouse_with_floors(w: WarehouseCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # STEP 0: Check if manager already owns a warehouse
        cur.execute("SELECT id FROM warehouses WHERE created_by = %s", (w.created_by,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Manager already owns a warehouse")

        # STEP 1: Insert Warehouse
        cur.execute(
            "INSERT INTO warehouses (name, location, width, height, depth, status, created_by) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (w.name, w.location, w.width, w.height, w.depth, w.status, w.created_by)
        )
        warehouse_id = cur.fetchone()['id']

        # STEP 1.5: Update User's Warehouse Association
        cur.execute("UPDATE users SET warehouse_id = %s WHERE id = %s", (warehouse_id, w.created_by))

        # STEP 2: Iterate through Floors
        for f in w.floors:
            cur.execute(
                "INSERT INTO floors (warehouse_id, floor_number) VALUES (%s, %s) RETURNING id",
                (warehouse_id, f.floor_number)
            )
            floor_id = cur.fetchone()['id']

            # STEP 3: Insert Areas
            if f.areas:
                for a in f.areas:
                    cur.execute(
                        "INSERT INTO areas (floor_id, area_name, width, height, depth, location_x, location_y, area_type, usage_category, is_passable) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (floor_id, a.area_name, a.width, a.height, a.depth, a.location_x, a.location_y, a.area_type, a.usage_category, a.is_passable)
                    )

            # STEP 4: Insert Zones
            if f.zones:
                for z in f.zones:
                    cur.execute(
                        "INSERT INTO zones (floor_id, zone_name, zone_type, width, depth, location_x, location_y) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                        (floor_id, z.zone_name, z.zone_type, z.width, z.depth, z.location_x, z.location_y)
                    )
                    zone_id = cur.fetchone()['id']

                    # STEP 5: Insert Shelves
                    if z.shelves:
                        for s in z.shelves:
                            import json
                            cur.execute(
                                """INSERT INTO shelves (zone_id, shelf_code, shelf_type, aisle_num, bay_num, level_num, bin_num, 
                                   width, depth, height, location_x, location_y, location_z, max_weight, status) 
                                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                                (zone_id, s.shelf_code, s.shelf_type, s.aisle_num, s.bay_num, s.level_num, s.bin_num,
                                 s.width, s.depth, s.height, s.location_x, s.location_y, s.location_z, 
                                 s.max_weight, s.status)
                            )

        conn.commit()
        return {"message": "Full warehouse hierarchy created successfully", "warehouse_id": warehouse_id}

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/floors/{floor_id}/zones")
async def create_zone(floor_id: int, z: ZoneCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO zones (floor_id, zone_name, zone_type, width, depth, location_x, location_y) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (floor_id, z.zone_name, z.zone_type, z.width, z.depth, z.location_x, z.location_y)
        )
        zone_id = cur.fetchone()['id']

        if z.shelves:
            import json
            for s in z.shelves:
                cur.execute(
                    """INSERT INTO shelves (zone_id, shelf_code, shelf_type, aisle_num, bay_num, level_num, bin_num, 
                       width, depth, height, location_x, location_y, location_z, max_weight, status) 
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (zone_id, s.shelf_code, s.shelf_type, s.aisle_num, s.bay_num, s.level_num, s.bin_num,
                     s.width, s.depth, s.height, s.location_x, s.location_y, s.location_z, 
                     s.max_weight, s.status)
                )

        conn.commit()
        return {"message": "Zone created successfully", "id": zone_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/floors/{floor_id}/areas")
async def create_area(floor_id: int, a: AreaCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO areas (floor_id, area_name, width, height, depth, location_x, location_y, area_type, usage_category, is_passable) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (floor_id, a.area_name, a.width, a.height, a.depth, a.location_x, a.location_y, a.area_type, a.usage_category, a.is_passable)
        )
        area_id = cur.fetchone()['id']
        conn.commit()
        return {"message": "Area created successfully", "id": area_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/zones/{zone_id}/shelves/bulk")
async def create_shelves_bulk(zone_id: int, shelves: List[ShelfCreate]):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        import json
        # 1. Clear existing shelves for this zone (Layout Replacement)
        cur.execute("DELETE FROM shelves WHERE zone_id = %s", (zone_id,))
        
        # 2. Insert new shelves
        for s in shelves:
            cur.execute(
                """INSERT INTO shelves (zone_id, shelf_code, shelf_type, aisle_num, bay_num, level_num, bin_num, 
                   width, depth, height, location_x, location_y, location_z, max_weight, status) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (zone_id, s.shelf_code, s.shelf_type, s.aisle_num, s.bay_num, s.level_num, s.bin_num,
                 s.width, s.depth, s.height, s.location_x, s.location_y, s.location_z, 
                 s.max_weight, s.status)
            )
        conn.commit()
        return {"message": f"{len(shelves)} shelves created successfully"}
    except Exception as e:
        print(f"Error in create_shelves_bulk: {e}")
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

# UPDATE & DELETE ENDPOINTS

@app.put("/shelves/{shelf_id}")
async def update_shelf(shelf_id: int, s: ShelfUpdate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        update_data = s.dict(exclude_unset=True)
        if not update_data:
            return {"message": "No changes provided"}
        
        fields = ", ".join([f"{k} = %s" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(shelf_id)

        cur.execute(f"UPDATE shelves SET {fields} WHERE id = %s", values)
        conn.commit()
        return {"message": "Shelf updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.get("/warehouses")
async def get_warehouses():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM warehouses")
        warehouses = cur.fetchall()
        
        for wh in warehouses:
            cur.execute("SELECT * FROM floors WHERE warehouse_id = %s ORDER BY floor_number", (wh['id'],))
            floors = cur.fetchall()
            wh['floors'] = floors
            
            for f in floors:
                cur.execute("SELECT * FROM areas WHERE floor_id = %s", (f['id'],))
                areas = cur.fetchall()
                f['areas'] = areas

                cur.execute("SELECT * FROM zones WHERE floor_id = %s", (f['id'],))
                zones = cur.fetchall()
                f['zones'] = zones
                
                for z in zones:
                    cur.execute("SELECT * FROM shelves WHERE zone_id = %s", (z['id'],))
                    shelves = cur.fetchall()
                    z['shelves'] = shelves
        
        return warehouses
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.delete("/shelves/{shelf_id}")
async def delete_shelf(shelf_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM shelves WHERE id = %s", (shelf_id,))
        conn.commit()
        return {"message": "Shelf deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.put("/zones/{zone_id}")
async def update_zone(zone_id: int, z: ZoneUpdate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        update_data = z.dict(exclude_unset=True)
        if not update_data:
            return {"message": "No changes provided"}
        
        fields = ", ".join([f"{k} = %s" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(zone_id)

        cur.execute(f"UPDATE zones SET {fields} WHERE id = %s", values)
        conn.commit()
        return {"message": "Zone updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.delete("/zones/{zone_id}")
async def delete_zone(zone_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 1. Delete associated shelves first
        cur.execute("DELETE FROM shelves WHERE zone_id = %s", (zone_id,))
        # 2. Delete the zone
        cur.execute("DELETE FROM zones WHERE id = %s", (zone_id,))
        conn.commit()
        return {"message": "Zone and its shelves deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/zones/{zone_id}/move")
async def move_zone(zone_id: int, m: ZoneMove):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 1. Get old coordinates to calculate delta
        cur.execute("SELECT location_x, location_y FROM zones WHERE id = %s", (zone_id,))
        old = cur.fetchone()
        if not old:
            raise HTTPException(status_code=404, detail="Zone not found")
        
        dx = m.location_x - float(old['location_x'])
        dy = m.location_y - float(old['location_y'])

        # 2. Update Zone
        cur.execute("UPDATE zones SET location_x = %s, location_y = %s WHERE id = %s", (m.location_x, m.location_y, zone_id))

        # 3. Update Shelves by delta
        cur.execute("UPDATE shelves SET location_x = location_x + %s, location_y = location_y + %s WHERE zone_id = %s", (dx, dy, zone_id))

        conn.commit()
        return {"message": "Zone and shelves moved successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.put("/areas/{area_id}")
async def update_area(area_id: int, a: AreaUpdate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        update_data = a.dict(exclude_unset=True)
        if not update_data:
            return {"message": "No changes provided"}
        
        fields = ", ".join([f"{k} = %s" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(area_id)

        cur.execute(f"UPDATE areas SET {fields} WHERE id = %s", values)
        conn.commit()
        return {"message": "Area updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.delete("/areas/{area_id}")
async def delete_area(area_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM areas WHERE id = %s", (area_id,))
        conn.commit()
        return {"message": "Area deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.get("/warehouses")
async def get_warehouses():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Complex multi-level JSON aggregation query
        query = """
        SELECT w.*, 
            u.username as owner_name,
            COALESCE((
                SELECT json_agg(floor_data)
                FROM (
                    SELECT f.*,
                        COALESCE((
                            SELECT json_agg(area_data)
                            FROM (SELECT * FROM areas WHERE floor_id = f.id) area_data
                        ), '[]') as areas,
                        COALESCE((
                            SELECT json_agg(zone_data)
                            FROM (
                                SELECT z.*,
                                    COALESCE((
                                        SELECT json_agg(shelf_data)
                                        FROM (SELECT * FROM shelves WHERE zone_id = z.id) shelf_data
                                    ), '[]') as shelves
                                FROM zones z
                                WHERE z.floor_id = f.id
                            ) zone_data
                        ), '[]') as zones
                    FROM floors f
                    WHERE f.warehouse_id = w.id
                ) floor_data
            ), '[]') as floors
        FROM warehouses w
        LEFT JOIN users u ON w.created_by = u.id
        GROUP BY w.id, u.username
        ORDER BY w.created_at DESC;
        """
        cur.execute(query)
        return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()