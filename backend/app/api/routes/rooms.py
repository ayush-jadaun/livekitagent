from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import RoomInfo
from app.services.database import ensure_user_exists
from app.api.dependencies import get_current_user, get_db
from app.core.logging import logger

router = APIRouter(prefix="/api/users", tags=["rooms"])

@router.get("/room")
async def get_user_room(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        room_id, room_name = await ensure_user_exists(conn, user_id)
        room_info = await conn.fetchrow("""
            SELECT id, room_name, room_condition 
            FROM room 
            WHERE user_id = $1
        """, user_id)
        return RoomInfo(
            room_id=str(room_info['id']),
            room_name=room_info['room_name'],
            room_condition=room_info['room_condition']
        )
    except Exception as e:
        logger.error(f"Error getting room info: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get room info")