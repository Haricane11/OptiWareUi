import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def get_conn():
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is missing in backend/.env (e.g. postgresql://user:pass@localhost:5432/db)"
        )
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

from typing import Optional

from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorCollection,
    AsyncIOMotorDatabase,
)

DB_NAME = "optiware"
PURCHASE_INVOICES_COLLECTION = "purchase_invoices"


class MongoDB:
    def __init__(self) -> None:
        self._client: Optional[AsyncIOMotorClient] = None
        self._db: Optional[AsyncIOMotorDatabase] = None

    def connect(self) -> None:
        mongo_url = os.getenv("MONGO_URL")
        if not mongo_url:
            raise RuntimeError("MONGO_URL environment variable is not set.")

        self._client = AsyncIOMotorClient(
            mongo_url,
            uuidRepresentation="standard",
            serverSelectionTimeoutMS=5000,
        )
        self._db = self._client[DB_NAME]

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
        self._client = None
        self._db = None

    @property
    def db(self) -> AsyncIOMotorDatabase:
        if self._db is None:
            raise RuntimeError("MongoDB not connected. Call mongodb.connect() first.")
        return self._db

    @property
    def purchase_invoices(self) -> AsyncIOMotorCollection:
        return self.db[PURCHASE_INVOICES_COLLECTION]


mongodb = MongoDB()
