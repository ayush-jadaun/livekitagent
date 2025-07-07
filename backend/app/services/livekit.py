from livekit import api
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from app.config import settings
from app.core.logging import logger

def generate_access_token(identity: str, name: str, room: str) -> str:
    try:
        token = api.AccessToken(
            settings.LIVEKIT_API_KEY,
            settings.LIVEKIT_API_SECRET
        ).with_identity(identity) \
         .with_name(name) \
         .with_grants(api.VideoGrants(
             room_join=True,
             room=room,
             room_create=True,
         ))
        return token.to_jwt()
    except Exception as e:
        logger.error(f"Error generating token: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")

def get_config():
    return {
        "livekit_url": settings.LIVEKIT_URL,
        "server_status": "running"
    }