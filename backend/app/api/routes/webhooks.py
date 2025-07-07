from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from app.services.agent_manager import stop_agent
from app.core.logging import logger

router = APIRouter(tags=["webhooks"])

@router.post("/livekit-webhook")
async def livekit_webhook(request: Request):
    try:
        payload = await request.json()
        event = payload.get("event")
        room_name = payload.get("room", {}).get("name")
        logger.info(f"Webhook event: {event} for room: {room_name}")

        if event == "room_finished" and room_name:
            stop_agent(room_name)
        return {"status": "received"}
    except Exception as e:
        logger.error(f"Error handling webhook: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": "Webhook handling failed"}
        )