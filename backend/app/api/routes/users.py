from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import UserCreate
from app.services.database import ensure_user_exists
from app.api.dependencies import get_current_user, get_db
from app.core.logging import logger

router = APIRouter(prefix="/api/users", tags=["users"])

@router.post("/setup")
async def setup_user(
    user_data: UserCreate,
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        room_id, room_name = await ensure_user_exists(
            conn, user_id, user_data.model_dump()
        )
        await conn.execute("""
            UPDATE users 
            SET name = $1, age = $2, onboarding = 'Done', updated_at = NOW()
            WHERE id = $3
        """, user_data.name, user_data.age, user_id)
        return {
            "user_id": user_id,
            "room_id": room_id,
            "room_name": room_name,
            "status": "setup_complete"
        }
    except Exception as e:
        logger.error(f"Error in user setup: {str(e)}")
        raise HTTPException(status_code=500, detail="Setup failed")