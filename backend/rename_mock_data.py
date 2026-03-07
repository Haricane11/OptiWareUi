import asyncio
import random
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.products import Product

REAL_WORLD_NAMES = [
    "Logitech G Pro Wireless Gaming Mouse",
    "Keychron Q1 Pro Mechanical Keyboard",
    "Sony WH-1000XM5 Noise Canceling Headphones",
    "Apple AirPods Pro (2nd Generation)",
    "Samsung 990 PRO 2TB NVMe SSD",
    "Western Digital 4TB Elements Portable HDD",
    "ASUS ROG Strix 27\" 1440p Gaming Monitor",
    "Dell UltraSharp 32\" 4K USB-C Hub Monitor",
    "Anker 737 Power Bank (PowerCore 24K)",
    "Belkin MagSafe 3-in-1 Wireless Charger",
    "Elgato Stream Deck MK.2",
    "Rode NT-USB Mini Studio Condenser Microphone",
    "Logitech C920x HD Pro Webcam",
    "Secretlab TITAN Evo 2022 Gaming Chair",
    "Herman Miller Aeron Ergonomic Office Chair",
    "Oculus Quest 3 Advanced All-in-One VR Headset",
    "Nintendo Switch OLED Model",
    "PlayStation 5 DualSense Wireless Controller",
    "Xbox Core Wireless Controller",
    "Corsair Vengeance LPX 32GB DDR4 RAM",
    "G.Skill Trident Z5 RGB 64GB DDR5 RAM",
    "NZXT Kraken Elite 360 RGB AIO Cooler",
    "Noctua NH-D15 Premium CPU Cooler",
    "AMD Ryzen 9 7950X3D Processor",
    "Intel Core i9-14900K Desktop Processor",
    "NVIDIA GeForce RTX 4070 Ti Super",
    "ASUS TUF Gaming GeForce RTX 4090",
    "MSI MAG B650 Tomahawk WiFi Motherboard",
    "Gigabyte Z790 AORUS Elite AX Motherboard",
    "Corsair RM850x 80 Plus Gold Power Supply",
    "Samsung Odyssey G9 49\" Curved Monitor",
    "LG C3 Series 42\" OLED evo Smart TV",
    "Bose QuietComfort Earbuds II",
    "Sennheiser MOMENTUM 4 Wireless Headphones",
    "JBL Flip 6 Portable Bluetooth Speaker",
    "Sonos Roam Smart Portable Wi-Fi Speaker",
    "Google Nest Hub Max Smart Display",
    "Amazon Echo Dot (5th Gen) Smart Speaker",
    "Philips Hue White & Color Ambiance Starter Kit",
    "Ring Video Doorbell Pro 2",
    "Nest Learning Thermostat (3rd Generation)",
    "Arlo Pro 4 Spotlight Camera Security System",
    "DJI Mini 4 Pro Drone Fly More Combo",
    "GoPro HERO12 Black Action Camera",
    "Insta360 X3 Waterproof 360 Action Camera",
    "Wacom Cintiq 16 Creative Pen Display",
    "Apple iPad Pro 12.9-inch (M2)",
    "Samsung Galaxy Tab S9 Ultra",
    "Kindle Paperwhite Signature Edition",
    "Garmin Fenix 7X Sapphire Solar Smartwatch",
    "Apple Watch Ultra 2",
    "Fitbit Charge 6 Fitness Tracker"
]

async def rename_mock_products():
    async with async_session_factory() as db:
        stmt = select(Product).where(Product.name.like('%Mock%'))
        products = (await db.execute(stmt)).scalars().all()
        
        print(f"Found {len(products)} mock products to rename.")
        
        # Shuffle the real-world names
        random.shuffle(REAL_WORLD_NAMES)
        
        for i, product in enumerate(products):
            # If we run out of names, just use the index as a suffix
            if i < len(REAL_WORLD_NAMES):
                new_name = REAL_WORLD_NAMES[i]
            else:
                new_name = f"Generic Tech Accessory {i - len(REAL_WORLD_NAMES) + 1}"
                
            old_name = product.name
            product.name = new_name
            print(f"Renamed: '{old_name}' -> '{new_name}'")
            
        await db.commit()
        print("Mock products successfully renamed to real-world names.")

if __name__ == "__main__":
    asyncio.run(rename_mock_products())
