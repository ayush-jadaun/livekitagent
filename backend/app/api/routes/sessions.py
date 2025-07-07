from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import SessionResponse
from app.services.database import ensure_user_exists, create_session, end_session
from app.services.livekit import generate_access_token
from app.services.agent_manager import trigger_agent_connection, stop_agent, active_agents
from app.api.dependencies import get_current_user, get_db
from app.config import settings
from app.core.logging import logger

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

@router.post("/start")
async def start_session(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        room_id, room_name = await ensure_user_exists(conn, user_id)
        session_id = await create_session(conn, user_id, room_id)
        
        token = generate_access_token(
            identity=user_id,
            name=f"user_{user_id}",
            room=room_name
        )
        
        # Start (or restart) agent process for this room
        if room_name in active_agents:
            stop_agent(room_name)
        trigger_agent_connection(room_name)
        
        return SessionResponse(
            session_id=session_id,
            room_name=room_name,
            room_id=room_id,
            token=token,
            livekit_url=settings.LIVEKIT_URL
        )
    except Exception as e:
        logger.error(f"Error starting session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start session")

@router.post("/{session_id}/end")
async def end_session_endpoint(
    session_id: str,
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        await end_session(conn, session_id, user_id)
        return {"status": "session_ended", "session_id": session_id}
    except Exception as e:
        logger.error(f"Error ending session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to end session")

@router.get("/active")
async def get_active_sessions(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        sessions = await conn.fetch("""
            SELECT s.id, s.started_at, r.room_name, r.room_condition
            FROM sessions s
            JOIN room r ON s.room_id = r.id
            WHERE s.user_id = $1 AND s.finished_at IS NULL
            ORDER BY s.started_at DESC
        """, user_id)
        return [dict(session) for session in sessions]
    except Exception as e:
        logger.error(f"Error getting active sessions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get active sessions")