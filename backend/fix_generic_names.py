import asyncio
import random
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.products import Product

NEW_NAMES = [
    "Logitech MX Master 3S Mouse",
    "Anker 7-in-1 USB-C Hub",
    "SanDisk 1TB Extreme Portable SSD",
    "Belkin BoostCharge Pro Wireless Stand",
    "Samsung T7 Shield 2TB Portable SSD",
    "Keychron K2 Wireless Mechanical Keyboard",
    "Bose QuietComfort Earbuds II",
    "Elgato Stream Deck MK.2",
    "Razer DeathAdder V3 Pro Gaming Mouse",
    "Corsair K70 RGB PRO Mechanical Keyboard",
    "HyperX QuadCast S USB Microphone",
    "Blue Yeti Nano Premium USB Mic",
    "Logitech Brio 4K Webcam",
    "Anker PowerCore 10000 Portable Charger",
    "WD 2TB Elements Portable External Hard Drive",
    "Seagate Portable 2TB External Hard Drive HDD",
    "Jabra Elite 85t True Wireless Earbuds",
    "Sony WF-1000XM4 Noise Canceling Earbuds",
    "SteelSeries Arctis Nova Pro Wireless Headset",
    "Apple Magic Trackpad",
    "Satechi Aluminum Type-C Stand & Hub",
    "Logitech G502 HERO High Performance Gaming Mouse",
    "Anker Nano II 65W USB-C Charger",
    "TP-Link Deco AX3000 WiFi 6 Mesh System",
    "Netgear Nighthawk Smart Wi-Fi Router",
    "Asus ROG Rapture GT-AX11000",
    "Crucial X8 1TB Portable SSD",
    "Logitech ERGO K860 Wireless Ergonomic Keyboard",
    "Razer BlackWidow V3 Mechanical Gaming Keyboard",
    "Corsair HS70 Pro Wireless Gaming Headset",
    "Samsung 980 PRO Pro SSD 1TB PCIe NVMe Gen 4",
    "WD_BLACK 1TB SN850 NVMe Internal Gaming SSD",
    "Anker Soundcore Life Q30 Active Noise Cancelling Headphones",
    "Sony WH-CH710N Wireless Headphones",
    "Bose SoundLink Micro Bluetooth Speaker",
    "Ultimate Ears WONDERBOOM 2",
    "JBL Flip 6 Portable Bluetooth Speaker",
    "Marshall Emberton Bluetooth Portable Speaker",
    "Apple 20W USB-C Power Adapter",
    "Belkin MagSafe 3-in-1 Wireless Charger",
    "Spigen ArcField Magnetic Wireless Charger",
    "Nomad Base Station Apple Watch",
    "Elgato Key Light Air",
    "Logitech Litra Glow Premium LED Streaming Light",
    "Razer Kiyo Pro Streaming Webcam",
    "AOC CQ27G2 27\" Super Curved Frameless Gaming Monitor",
    "Dell S3222DGM 32\" Curved Gaming Monitor",
    "LG 27GL83A-B 27 Inch Ultragear QHD IPS 1ms",
    "ASUS ProArt Display PA278CV 27\"",
    "BenQ PD2700Q 27 inch QHD 1440p IPS Monitor",
]

async def update_generic_names():
    async with async_session_factory() as db:
        stmt = select(Product).where(Product.name.like("%Generic Tech Accessory%"))
        result = await db.execute(stmt)
        products = result.scalars().all()
        
        print(f"Found {len(products)} products with 'Generic Tech Accessory' name.")
        
        available_names = NEW_NAMES.copy()
        random.shuffle(available_names)
        
        updated_count = 0
        for product in products:
            if not available_names:
                # If we run out of unique names, just shuffle again and reuse
                available_names = NEW_NAMES.copy()
                random.shuffle(available_names)
            
            new_name = available_names.pop(0)
            print(f"Renaming '{product.name}' -> '{new_name}'")
            product.name = new_name
            updated_count += 1
            
        if updated_count > 0:
            await db.commit()
            print(f"Successfully updated {updated_count} product names.")

if __name__ == "__main__":
    asyncio.run(update_generic_names())
