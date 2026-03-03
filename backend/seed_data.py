import os
import sys
from datetime import datetime, timedelta
import random
import requests

# Add backend directory to sys.path so we can import app
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.warehouse import Warehouse, Floor, Zone, ShelfType, Shelf
from app.models.supplier import Supplier
from app.models.products import Product
from app.models.inventory import Inventory
from app.models.reorder_policy import ReorderPolicy
from app.models.receipt import Receipt, ReceiptItem
from app.models.demand_analytics import ProductDemandAnalytics
from app.models.inventory_health import InventoryHealthStatus, InventoryActionSuggestion, InventoryOptimizationConfig
from app.models.bundle import Bundle, BundleItem, BundleSale

# Ensure we connect to the right database
# We read from .env in backend/ but replace asyncpg with psycopg2
from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, ".env"))
db_url = os.getenv("DATABASE_URL")
# The running app is connected to the wms DB actually, let's hardcode the engine URL to the one that works
db_url = "postgresql://wms_user:root123@127.0.0.1:5433/wms"

engine = create_engine(db_url)
Session = sessionmaker(bind=engine)
session = Session()

def clear_existing_data():
    print("Clearing existing data...")
    # Clean up in reverse dependency order
    session.query(BundleItem).delete()
    session.query(BundleSale).delete()
    session.query(Bundle).delete()
    session.query(InventoryActionSuggestion).delete()
    session.query(InventoryHealthStatus).delete()
    session.query(ProductDemandAnalytics).delete()
    session.query(ReceiptItem).delete()
    session.query(Receipt).delete()
    session.query(Inventory).delete()
    session.query(ReorderPolicy).delete()
    session.query(Product).delete()
    session.query(Supplier).delete()
    session.query(Shelf).delete()
    session.query(ShelfType).delete()
    session.query(Zone).delete()
    session.query(Floor).delete()
    session.query(Warehouse).delete()
    session.commit()

def seed_base_data():
    print("Seeding base warehouse and supplier...")
    wh = Warehouse(name="Primary Distribution Center", location="New York, NY", width=100, height=50, depth=100)
    session.add(wh)
    session.commit()
    
    fl = Floor(warehouse_id=wh.id, floor_number=1)
    session.add(fl)
    session.commit()

    zone = Zone(floor_id=fl.id, zone_code="A1", zone_type="STORAGE", product_category="ALL")
    session.add(zone)
    session.commit()

    st = ShelfType(type_code="STD", type_name="Standard Rack")
    session.add(st)
    session.commit()

    shelf = Shelf(zone_id=zone.id, shelf_code="A1-1", shelf_type="STD", width=10, depth=10, height=10, max_weight=1000)
    session.add(shelf)
    
    supplier = Supplier(
        name="Global Supplies Inc.", 
        email="contact@globalsupplies.com",
        allows_return=True,
        return_window_days=90
    )
    session.add(supplier)
    session.commit()
    
    return wh, shelf, supplier

def generate_products(supplier_id):
    product_catalog = {
        "Electronics": [
            "LG 65-inch OLED TV", "Sony WH-1000XM5 Headphones", "Apple MacBook Air M2", "Samsung Galaxy S24 Ultra", "Dell UltraSharp 32 4K Monitor",
            "Bose Smart Soundbar 900", "Nintendo Switch OLED", "Garmin Fenix 7X Pro", "Anker PowerCore 24K", "Sonos Roam Portable Speaker",
            "Logitech MX Master 3S", "Razer Huntsman Mini", "Canon EOS R6 Mark II", "DJI Mini 3 Pro Drone", "Google Pixel 8 Pro",
            "GoPro HERO12 Black", "Sony PlayStation 5", "Microsoft Xbox Series X", "Kindle Paperwhite Signature", "Samsung 990 PRO 2TB SSD",
            "Corsair Vengeance 32GB RAM", "NVIDIA RTX 4080 Super", "AMD Ryzen 7 7800X3D", "Asus ROG Rapture GT-AX11000", "Epson EcoTank ET-4850",
            "Wacom Cintiq 16", "Elgato Stream Deck MK.2", "Blue Yeti USB Microphone", "Apple iPad Pro 12.9", "Samsung Odyssey G9 Monitor"
        ],
        "Groceries": [
            "Organic Honeycrisp Apples (Bag)", "Kirkland Signature Olive Oil", "Oatly Oat Milk Barista Edition", "Sriracha Hot Chili Sauce", "Lavazza Super Crema Espresso",
            "Quinoa Originario (2lb)", "Rao's Homemade Marinara", "Nongshim Shin Ramyun Multipack", "Haribo Goldbears (1lb)", "Chobani Greek Yogurt (12-pack)",
            "Cholula Original Hot Sauce", "Barilla Penne Pasta (16oz)", "Kerrygold Pure Irish Butter", "Himalayan Pink Salt Grinder", "McCormick Pure Vanilla Extract",
            "Vital Farms Pasture-Raised Eggs", "Oreo Double Stuf Family Size", "Heinz Tomato Ketchup", "Hellmann's Real Mayonnaise", "Skippy Creamy Peanut Butter",
            "Ocean Spray Cranberry Juice", "San Pellegrino Sparkling Water", "Fiji Natural Artesian Water", "Tostitos Scoops! Tortilla Chips", "Lay's Classic Potato Chips",
            "Quaker Oats Old Fashioned", "Kellogg's Frosted Flakes", "Folgers Classic Roast Coffee", "Tropicana Pure Premium Orange Juice", "Almond Breeze Unsweetened Original"
        ],
        "Apparel": [
            "Levi's 501 Original Fit Jeans", "Nike Air Force 1 '07", "Patagonia Better Sweater Fleece", "Columbia Newton Ridge Hiking Boots", "Lululemon Align High-Rise Pant",
            "Champion Reverse Weave Hoodie", "Hanes Mens Ecosmart Fleece", "Under Armour Tech 2.0 T-Shirt", "Adidas Ultraboost Light", "Carhartt Relaxed Fit T-Shirt",
            "The North Face Gotham Jacket", "Vans Old Skool Sneakers", "Converse Chuck Taylor All Star", "Calvin Klein Cotton Boxer Briefs", "Dickies Original 874 Work Pant",
            "Wrangler Authentics Cargo Pant", "Gildan Men's Crew T-Shirts", "Skechers Go Walk Joy", "Dr. Martens 1460 8-Eye Boot", "Crocs Classic Clog",
            "Brooks Ghost 15 Running Shoe", "New Balance 990v6", "Puma Suede Classic", "Timberland Premium 6-Inch Boot", "Ray-Ban Classic Aviator",
            "Oakley Holbrook Sunglasses", "Fossil Neutra Chronograph Watch", "Michael Kors Crossbody Bag", "Herschel Supply Co. Classic Backpack", "Samsonite Winfield 2 Luggage"
        ],
        "HomeGoods": [
            "Dyson V15 Detect Vacuum", "Ninja Mega Kitchen System", "Instant Pot Duo 7-in-1", "Keurig K-Elite Coffee Maker", "KitchenAid Artisan Stand Mixer",
            "Breville Smart Oven Air Fryer", "Cuisinart 14-Cup Food Processor", "Vitamix 5200 Blender", "iRobot Roomba j7+", "Shark Navigator Lift-Away",
            "Bissell Little Green Machine", "OXO Good Grips Pop Containers", "Lodge Cast Iron Skillet 10.25\"", "Pyrex Glass Measuring Cup", "Rubbermaid Brilliance Storage sets",
            "YETI Rambler 20 oz Tumbler", "Hydro Flask Standard Mouth", "Nespresso VertuoPlus Deluxe", "Zojirushi Rice Cooker", "Simplehuman 45L Trash Can",
            "Casper Sleep Original Pillow", "Tempur-Pedic Symphony Pillow", "Brooklinen Luxe Core Sheet Set", "Utopia Bedding Down Alternative Comforter", "Bedsure Fleece Throw Blanket",
            "Mellanni Sheet Set", "Yankee Candle MidSummer's Night", "Air Wick Essential Mist Starter Kit", "Febreze Air Freshener Spray", "Command Medium Picture Hanging Strips"
        ],
        "Tools": [
            "DeWalt 20V Max Cordless Drill", "Makita 18V LXT Impact Driver", "Milwaukee M18 Fuel Hackzall", "Bosch Laser Distance Measure", "Craftsman 121-Piece Tool Set",
            "Ryobi ONE+ 18V Circular Saw", "Ridgid 14-Gallon Wet/Dry Vac", "Stanley FatMax 25-Foot Tape", "Irwin Vise-Grip Pliers Set", "Knipex Cobra Water Pump Pliers",
            "Wiha Insulated Screwdriver Set", "Klein Tools Wire Stripper", "Wera Zyklop Speed Ratchet", "Estwing Sure Strike Hammer", "Channellock Tongue & Groove Pliers",
            "Dremel 3000 Rotary Tool", "Skil 15 Amp Circular Saw", "Black+Decker 20V Max Drill", "Werner 6-Foot Fiberglass Stepladder", "Husky 3-Drawer Portable Tool Box",
            "Gorilla Heavy Duty Construction Adhesive", "3M Super 77 Multipurpose Adhesive", "WD-40 Multi-Use Product", "PB B'laster Penetrating Catalyst", "Loctite Threadlocker Blue 242",
            "Shop-Vac 5-Gallon Wet/Dry", "Fiskars Steel Bypass Pruning Shears", "Gorilla Carts Poly Garden Dump Cart", "Ego Power+ 56V String Trimmer", "Greenworks 40V Axial Leaf Blower"
        ],
        "AnalyticsTest": [
            "Premium Handcrafted Leather Sofa", "Bulk Industrial Lubricant 55G", "Vintage 1960s Fender Stratocaster", "Medical Grade MRI Component X9", "Enterprise Server Rack Unit 42U",
            "Commercial Espresso Machine Pro", "Caterpillar Bulldozer Parts Kit", "Aircraft Grade Titanium Sheets", "Luxury Diamond Encrusted Watch", "Obsolete Floppy Drive Inventory",
            "Seasonal Ski Snowboard Boots", "Discontinued 3D Printer Resin", "Limited Edition Collectible Figurine", "Specialty Exotic Hardwood Planks", "Industrial Robotic Arm Actuator",
            "Bulk Pallet of White Copy Paper", "Overprinted 2024 Wall Calendars", "Unsold Halloween Costumes (Mixed)", "Decommissioned POS Terminal Hubs", "Legacy Copper Networking Cable",
            "Bulk Promotional T-Shirts (Defect)", "Unbranded Generic USB Cables", "Surplus Fidget Spinners (2017)", "Overstock Y2K Emergency Kits", "Expired Photographic Film Bulk",
            "Unused Commercial Airline Seats", "Excess Neon Open Signs", "Outdated Encyclopedias (Set)", "Bulk VGA Monitor Adapters", "Excess Left-Handed Golf Clubs"
        ]
    }
    
    products = []
    
    print("Generating products...")
    for cat, names in product_catalog.items():
        # Generate 30 products per category using the precise names
        for i, name in enumerate(names[:30]):
            sku = f"{cat[:3].upper()}-{i+1:03d}"
            p = Product(
                sku=sku,
                name=name,
                category=cat,
                supplier_id=supplier_id,
                unit_price=round(random.uniform(50.0, 1500.0) if cat == "AnalyticsTest" else random.uniform(10.0, 500.0), 2),
                status="ACTIVE"
            )
            session.add(p)
            products.append(p)
            
    session.commit()
    return products

def seed_inventory_and_analytics(products, warehouse_id, shelf_id):
    print("Seeding inventory, reorder policies, and simulating health aspects...")
    today = datetime.now().date()
    
    # We want various scenarios:
    # 1. Normal/Healthy stock
    # 2. Low stock (Needs Reorder)
    # 3. Dead stock (No movement for > 90 days)
    # 4. Slow moving (High stock, low demand)
    # 5. Expiring soon (< 30 days)
    # 6. Expired
    
    for i, p in enumerate(products):
        # Determine scenario based on index to ensure we get a good mix
        # If it's an AnalyticsTest product, heavily bias towards DEAD and SLOW to maximize financial loss numbers
        scenario = i % 6
        if p.category == "AnalyticsTest":
            scenario = i % 2 + 2 # Will only be 2 (Dead) or 3 (Slow)
        
        # Base demand analytics (required for slow moving / reorder calculations)
        avg_daily = round(random.uniform(1.0, 20.0), 2)
        da = ProductDemandAnalytics(
            product_id=p.id,
            average_daily_demand=avg_daily,
            demand_std_dev=avg_daily * 0.2, # 20% variance
            window_days=90
        )
        session.add(da)
        
        # Base Reorder Policy
        lead_time = random.randint(3, 14)
        rop_calc = int(avg_daily * lead_time) + int(avg_daily * 3) # lead time demand + safety stock
        rp = ReorderPolicy(
            product_id=p.id,
            reorder_point=rop_calc,
            safety_stock=int(avg_daily * 3),
            eoq=int(avg_daily * 30), # 1 month supply
            lead_time_days=lead_time,
            average_daily_demand=avg_daily
        )
        session.add(rp)
        
        # Inventory variables
        qty = 0
        expiry = None
        received_offset_days = 10 # recently received by default
        
        if scenario == 0:
            # Healthy: Quantity well above ROP
            qty = rp.reorder_point + int(rp.eoq * random.uniform(0.5, 1.0))
            if "Groceries" in p.category:
                expiry = today + timedelta(days=random.randint(60, 180))
                
        elif scenario == 1:
            # Low stock: Quantity below ROP to trigger restock alerts
            qty = int(rp.reorder_point * random.uniform(0.1, 0.8))
            
        elif scenario == 2:
            # Dead stock: Old receipt, no recent demand (we override demand to 0)
            qty = int(rp.eoq * (3.0 if p.category == "AnalyticsTest" else 0.8)) # Huge qty for AnalyticsTest
            da.average_daily_demand = 0.0
            rp.average_daily_demand = 0.0
            received_offset_days = random.randint(100, 200) # Very old inventory
            
        elif scenario == 3:
            # Slow moving: Huge quantity compared to demand
            qty = int(avg_daily * (365 if p.category == "AnalyticsTest" else 180)) # 1 year of supply for AnalyticsTest!
            
        elif scenario == 4:
            # Expiring soon (Near Expiry)
            qty = rp.eoq
            expiry = today + timedelta(days=random.randint(5, 25)) # Expires in 5-25 days
            
        elif scenario == 5:
            # Expired
            qty = int(rp.eoq * 0.3)
            expiry = today - timedelta(days=random.randint(1, 30)) # Expired 1-30 days ago
            
        # Create the inventory record
        inv = Inventory(
            product_id=p.id,
            warehouse_id=warehouse_id,
            shelf_id=shelf_id,
            batch_number=f"BATCH-{p.sku}-1",
            quantity=qty,
            available=qty,
            allocated=0,
            received_date=today - timedelta(days=received_offset_days),
            expiry_date=expiry,
            status="ACTIVE" if not expiry or expiry > today else "EXPIRED"
        )
        session.add(inv)
        
        # Create an old receipt to officially back the "detected age" of the stock for dead/slow stock calculations
        # The backend analytics often looks at Receipts to judge how long things have been sitting
        r = Receipt(
            receipt_number=f"REC-{p.sku}-1",
            status="COMPLETED",
            received_at=datetime.now() - timedelta(days=received_offset_days)
        )
        session.add(r)
        session.flush() # get receipt ID
        
        ri = ReceiptItem(
            receipt_id=r.id,
            product_id=p.id,
            received_qty=qty,
            batch_number=inv.batch_number,
            expiry_date=expiry,
            assigned_shelf_id=shelf_id,
            placed_qty=qty,
            placement_status="PLACED"
        )
        session.add(ri)

    session.commit()

try:
    clear_existing_data()
    wh, shelf, supp = seed_base_data()
    prods = generate_products(supp.id)
    seed_inventory_and_analytics(prods, wh.id, shelf.id)
    
    # Trigger Analytics calculations automatically
    print("\nTriggering Analytics Calculation Engines...")
    try:
        r1 = requests.post("http://localhost:8000/inventory-health/recalculate-all")
        if r1.status_code == 200:
            print(" - V2 Financial Risk Data calculated.")
    except Exception as e:
        print(f" - Failed to reach V2 engine: {e}")
        
    try:
        r2 = requests.post("http://localhost:8000/analytics/run-health-scan")
        if r2.status_code == 200:
            print(" - V1 Stock Monitor Data calculated.")
    except Exception as e:
        print(f" - Failed to reach V1 engine: {e}")

    print("\n✅ Seed data successfully injected!")
except Exception as e:
    session.rollback()
    print(f"❌ Error seeding data: {e}")
finally:
    session.close()
