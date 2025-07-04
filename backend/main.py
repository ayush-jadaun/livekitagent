import os
import asyncio
import asyncpg # type: ignore
import requests
from typing import Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, Query, Request, HTTPException, Depends
from fastapi.responses import PlainTextResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from livekit import api
from dotenv import load_dotenv
import jwt
import logging
from contextlib import asynccontextmanager
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(title="LiveKit Backend Service", version="1.0.0")

# Security
security = HTTPBearer()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

# LiveKit configuration
LIVEKIT_API_KEY = os.getenv('LIVEKIT_API_KEY')
LIVEKIT_API_SECRET = os.getenv('LIVEKIT_API_SECRET')
LIVEKIT_URL = os.getenv('LIVEKIT_URL', 'wss://localhost:7880')

if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
    raise ValueError("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required")

# Supabase JWT configuration
SUPABASE_JWT_SECRET = os.getenv('SUPABASE_JWT_SECRET')
if not SUPABASE_JWT_SECRET:
    raise ValueError("SUPABASE_JWT_SECRET is required")

# Database connection pool
db_pool = None

# Pydantic models
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

# Database connection management
async def get_db_pool():
    global db_pool
    if db_pool is None:
        db_pool = await asyncpg.create_pool(DATABASE_URL)
    return db_pool

async def get_db():
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        yield conn

# Authentication helper
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Extract user ID from Supabase JWT token"""
    try:
        token = credentials.credentials
        
        # Add more detailed logging
        logger.info(f"Attempting to decode token: {token[:20]}...")
        
        # Decode the token - Note: Supabase uses different algorithm and verification
        payload = jwt.decode(
            token, 
            SUPABASE_JWT_SECRET, 
            algorithms=["HS256"],
            audience="authenticated",  # Supabase specific
            issuer="https://qivmwvqzgyykzmmofnqz.supabase.co/auth/v1"
        )
        
        user_id = payload.get("sub")
        if not user_id:
            logger.error("No 'sub' claim found in token")
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
            
        logger.info(f"Successfully authenticated user: {user_id}")
        return user_id
        
    except jwt.ExpiredSignatureError:
        logger.error("Token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in authentication: {str(e)}")
        raise HTTPException(status_code=401, detail="Authentication failed")

# Database functions
async def ensure_user_exists(conn, user_id: str, user_data: Optional[Dict] = None):
    """Ensure user exists in database and has a room assigned"""
    try:
        # Check if user exists
        existing_user = await conn.fetchrow(
            "SELECT id FROM users WHERE id = $1", user_id
        )
        
        if not existing_user:
            # Create user if doesn't exist
            name = user_data.get('name', 'Anonymous') if user_data else 'Anonymous'
            age = user_data.get('age') if user_data else None
            
            await conn.execute("""
                INSERT INTO users (id, name, age, onboarding, created_at, updated_at)
                VALUES ($1, $2, $3, 'Pending', NOW(), NOW())
            """, user_id, name, age)
            
            logger.info(f"Created new user: {user_id}")
        
        # Check if user has a room (should be auto-created by trigger)
        room = await conn.fetchrow(
            "SELECT id, room_name FROM room WHERE user_id = $1", user_id
        )
        
        if not room:
            # Fallback: create room manually if trigger didn't work
            room_name = f"room_{user_id}"
            room_id = await conn.fetchval("""
                INSERT INTO room (user_id, room_name, room_condition, created_at, updated_at)
                VALUES ($1, $2, 'off', NOW(), NOW())
                RETURNING id
            """, user_id, room_name)
            
            logger.info(f"Created room for user {user_id}: {room_name}")
            return str(room_id), room_name
        
        return str(room['id']), room['room_name']
        
    except Exception as e:
        logger.error(f"Error ensuring user exists: {str(e)}")
        raise HTTPException(status_code=500, detail="Database error")

async def create_session(conn, user_id: str, room_id: str):
    """Create a new session and turn room condition to 'on'"""
    try:
        # Start transaction
        async with conn.transaction():
            # Create new session
            session_id = await conn.fetchval("""
                INSERT INTO sessions (user_id, room_id, started_at)
                VALUES ($1, $2, NOW())
                RETURNING id
            """, user_id, room_id)
            
            # Turn room condition to 'on'
            await conn.execute("""
                UPDATE room 
                SET room_condition = 'on', updated_at = NOW()
                WHERE id = $1
            """, room_id)
            
            logger.info(f"Created session {session_id} for user {user_id}")
            return str(session_id)
            
    except Exception as e:
        logger.error(f"Error creating session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create session")

async def end_session(conn, session_id: str, user_id: str):
    """End a session and turn room condition to 'off'"""
    try:
        async with conn.transaction():
            # End session
            await conn.execute("""
                UPDATE sessions 
                SET finished_at = NOW()
                WHERE id = $1 AND user_id = $2
            """, session_id, user_id)
            
            # Turn room condition to 'off'
            await conn.execute("""
                UPDATE room 
                SET room_condition = 'off', updated_at = NOW()
                WHERE user_id = $1
            """, user_id)
            
            logger.info(f"Ended session {session_id} for user {user_id}")
            
    except Exception as e:
        logger.error(f"Error ending session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to end session")

async def trigger_agent_connection(room_name: str):
    """Trigger LiveKit agent to connect to room"""
    try:
        import subprocess
        subprocess.Popen([
            "python", "agent.py", "connect", "--room", room_name
        ])
        logger.info(f"Triggered agent connection for room: {room_name}")
    except Exception as e:
        logger.error(f"Error triggering agent: {str(e)}")

# API Endpoints
@app.post("/api/users/setup")
async def setup_user(
    user_data: UserCreate,
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    """Setup user profile and ensure room is assigned"""
    try:
        room_id, room_name = await ensure_user_exists(
            conn, user_id, user_data.model_dump()
        )
        
        # Update user profile
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

@app.post("/api/sessions/start")
async def start_session(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    """Start a new session - called when user clicks 'Call' button"""
    try:
        # Ensure user and room exist
        room_id, room_name = await ensure_user_exists(conn, user_id)
        
        # Create new session
        session_id = await create_session(conn, user_id, room_id)
        
        # Generate LiveKit token
        token = api.AccessToken(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET
        ).with_identity(user_id) \
         .with_name(f"user_{user_id}") \
         .with_grants(api.VideoGrants(
             room_join=True,
             room=room_name,
             room_create=True,
         ))
        
        # Trigger agent connection
        await trigger_agent_connection(room_name)
        
        return SessionResponse(
            session_id=session_id,
            room_name=room_name,
            room_id=room_id,
            token=token.to_jwt(),
            livekit_url=LIVEKIT_URL
        )
        
    except Exception as e:
        logger.error(f"Error starting session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start session")

@app.post("/api/sessions/{session_id}/end")
async def end_session_endpoint(
    session_id: str,
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    """End a session - called when user leaves the room"""
    try:
        await end_session(conn, session_id, user_id)
        return {"status": "session_ended", "session_id": session_id}
        
    except Exception as e:
        logger.error(f"Error ending session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to end session")

@app.get("/api/users/room")
async def get_user_room(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    """Get user's room information"""
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

@app.get("/api/sessions/active")
async def get_active_sessions(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    """Get user's active sessions"""
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


@app.get("/getToken", response_class=PlainTextResponse)
def get_token(
    room: str = Query(default="my-room"),
    identity: str = Query(default="user"),
    name: str = Query(default="Anonymous")
):
    """Legacy endpoint - Generate LiveKit token"""
    try:
        token = api.AccessToken(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET
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
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to generate token: {str(e)}"}
        )

@app.get("/config")
def get_config():
    """Return LiveKit server configuration"""
    return {
        "livekit_url": LIVEKIT_URL,
        "server_status": "running"
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "livekit-backend-service"}

# LiveKit webhook handler
@app.post("/livekit-webhook")
async def livekit_webhook(request: Request):
    """Handle LiveKit webhooks"""
    try:
        payload = await request.json()
        event = payload.get("event")
        
        if event == "room_started":
            room_name = payload["room"]["name"]
            logger.info(f"Room started: {room_name}")
            
        elif event == "room_finished":
            room_name = payload["room"]["name"]
            logger.info(f"Room finished: {room_name}")
            
        elif event == "participant_joined":
            room_name = payload["room"]["name"]
            participant = payload["participant"]
            logger.info(f"Participant joined room {room_name}: {participant['identity']}")
            
        elif event == "participant_left":
            room_name = payload["room"]["name"]
            participant = payload["participant"]
            logger.info(f"Participant left room {room_name}: {participant['identity']}")
            
        return {"status": "received"}
        
    except Exception as e:
        logger.error(f"Error handling webhook: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": "Webhook handling failed"}
        )

# Startup and shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context for startup and shutdown events."""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL)
        logger.info("Database connection pool initialized")
        yield
    finally:
        if db_pool:
            await db_pool.close()
            logger.info("Database connection pool closed")

app.router.lifespan_context = lifespan

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)