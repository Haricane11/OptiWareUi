import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import certifi

load_dotenv()

async def test_mongo():
    mongo_url = os.getenv("MONGO_URL")
    print(f"Testing connection to: {mongo_url}")
    
    # Try with default settings
    print("\n--- Test 1: Default Settings ---")
    try:
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
        await client.admin.command('ping')
        print("Success: Connected with default settings!")
    except Exception as e:
        print(f"Error 1: {e}")

    # Try with certifi
    print("\n--- Test 2: With Certifi ---")
    try:
        client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
        await client.admin.command('ping')
        print("Success: Connected with certifi!")
    except Exception as e:
        print(f"Error 2: {e}")

    # Try allowing invalid certificates
    print("\n--- Test 3: Allow Invalid Certificates ---")
    try:
        client = AsyncIOMotorClient(mongo_url, tlsAllowInvalidCertificates=True, serverSelectionTimeoutMS=5000)
        await client.admin.command('ping')
        print("Success: Connected with tlsAllowInvalidCertificates=True!")
    except Exception as e:
        print(f"Error 3: {e}")

if __name__ == "__main__":
    asyncio.run(test_mongo())
