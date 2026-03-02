from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, BeforeValidator
from typing import Optional, Dict, Any, List, Annotated
from datetime import datetime
from bson import ObjectId
from app.mongodb import mongodb

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"]
)

class PyObjectId(ObjectId):
    @classmethod
    def validate_object_id(cls, v: Any) -> ObjectId:
        if isinstance(v, ObjectId):
            return v
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema: Dict[str, Any]):
        field_schema.update(type="string")

ObjectIdAnnotation = Annotated[PyObjectId, BeforeValidator(PyObjectId.validate_object_id)]

class Notification(BaseModel):
    id: Optional[str] = None
    user_id: str # Could be staff_id or manager_id, or a generic user ID
    message: str
    type: str # e.g., "invoice_created", "item_scanned"
    related_id: Optional[str] = None # ID of the related document (e.g., invoice_id)
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.now)

    @classmethod
    def from_mongo(cls, data: Dict[str, Any]):
        if "_id" in data:
            data["id"] = str(data["_id"])
            data.pop("_id")
        return cls(**data)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        json_schema_extra = {
            "example": {
                "id": "60c728b2f9b1c2a3b4c5d6e7",
                "user_id": "staff123",
                "message": "Purchase invoice INV-2026-011 is arrived! with date 2026-02-23.",
                "type": "invoice_created",
                "related_id": "INV-2026-011",
                "read": False,
                "created_at": "2026-02-23T00:45:12.281000"
            }
        }

class NotificationCreate(BaseModel):
    user_id: str
    message: str
    type: str
    related_id: Optional[str] = None

def serialize_notification(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc["id"] = str(doc.pop("_id"))
    return doc

# API Endpoints will be added here



@router.post("", response_model=Notification)
async def create_notification(notification: NotificationCreate):
    notification_dict = notification.dict()
    notification_dict["created_at"] = datetime.now()
    notification_dict["read"] = False
    result = await mongodb.notifications.insert_one(notification_dict)
    created_notification = await mongodb.notifications.find_one({"_id": result.inserted_id})
    return created_notification

@router.get("", response_model=List[Notification])
async def list_notifications(user_id: Optional[str] = None, read: Optional[bool] = None):
    query = {}
    if user_id:
        query["user_id"] = user_id
    if read is not None:
        query["read"] = read
    print(f"MongoDB query for notifications: {query}")
    
    cursor = mongodb.notifications.find(query).sort("created_at", -1)
    notifications = []
    async for doc in cursor:
        notifications.append(Notification.from_mongo(doc))
    return notifications

@router.patch("/{notification_id}/read", response_model=Notification)
async def mark_notification_as_read(notification_id: str):
    try:
        object_id = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

    result = await mongodb.notifications.update_one(
        {"_id": object_id},
        {"$set": {"read": True}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found or already marked as read")
    
    updated_notification = await mongodb.notifications.find_one({"_id": object_id})
    return Notification.from_mongo(updated_notification)
