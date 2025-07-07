from typing import Optional
from pydantic import BaseModel

class UserCreate(BaseModel):
    name: str
    age: Optional[int] = None

class SessionResponse(BaseModel):
    session_id: str
    room_name: str
    room_id: str
    token: str
    livekit_url: str

class RoomInfo(BaseModel):
    room_id: str
    room_name: str
    room_condition: str