import os
import sys
import asyncpg
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.responses import PlainTextResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Add the parent directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.core.logging import logger
from app.services.database import close_db_pool
from app.services.livekit import generate_access_token, get_config
from app.services.agent_manager import cleanup_all_agents
from app.api.routes import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        # Initialize database pool
        db_pool = await asyncpg.create_pool(settings.DATABASE_URL)
        logger.info("Database connection pool initialized")
        yield
    finally:
        # Cleanup
        await close_db_pool()
        cleanup_all_agents()

app = FastAPI(
    title="LiveKit Backend Service", 
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API routes
app.include_router(api_router)

# Legacy endpoints for backward compatibility
@app.get("/getToken", response_class=PlainTextResponse)
def get_token(
    room: str = Query(default="my-room"),
    identity: str = Query(default="user"),
    name: str = Query(default="Anonymous")
):
    try:
        token = generate_access_token(identity, name, room)
        return token
    except Exception as e:
        logger.error(f"Error generating token: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to generate token: {str(e)}"}
        )

@app.get("/config")
def get_config_endpoint():
    return get_config()

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "livekit-backend-service"}

@app.get("/ping")
async def ping():
    return {"message": "pong"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)