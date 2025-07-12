import os
import asyncio
import asyncpg # type: ignore
import requests
from typing import Optional, Dict, Any
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
import subprocess

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

# --- AGENT PROCESS MANAGEMENT ---
active_agents: Dict[str, subprocess.Popen] = {}  # room_name -> process

def trigger_agent_connection(room_name: str):
    """Start agent process for the room via subprocess and track it."""
    try:
        proc = subprocess.Popen([
            "python", "agent.py", "connect", "--room", room_name
        ])
        active_agents[room_name] = proc
        logger.info(f"Started agent for room {room_name}, PID {proc.pid}")
    except Exception as e:
        logger.error(f"Failed to start agent for room {room_name}: {e}")

def stop_agent(room_name: str):
    """Terminate agent process for the room if running."""
    proc = active_agents.pop(room_name, None)
    if proc:
        logger.info(f"Terminating agent for room {room_name}, PID {proc.pid}")
        proc.terminate()
        try:
            proc.wait(timeout=5)
            logger.info(f"Agent for room {room_name} terminated")
        except Exception:
            logger.warning(f"Agent for room {room_name} did not terminate in time, killing.")
            proc.kill()
    else:
        logger.warning(f"No active agent found for room {room_name}")

# Pydantic models
class UserCreate(BaseModel):
    name: str
    age: Optional[int] = None

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None

class UserProfileResponse(BaseModel):
    user_id: str
    name: str
    age: Optional[int] = None
    onboarding: str
    created_at: str
    updated_at: str

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

async def get_current_user_with_metadata(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        logger.info(f"Attempting to decode token: {token[:20]}...")
        payload = jwt.decode(
            token, 
            SUPABASE_JWT_SECRET, 
            algorithms=["HS256"],
            audience="authenticated",
            issuer="https://qivmwvqzgyykzmmofnqz.supabase.co/auth/v1"
        )
        user_id = payload.get("sub")
        if not user_id:
            logger.error("No 'sub' claim found in token")
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
        logger.info(f"Successfully authenticated user: {user_id}")
        return user_id, payload
    except jwt.ExpiredSignatureError:
        logger.error("Token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in authentication: {str(e)}")
        raise HTTPException(status_code=401, detail="Authentication failed")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user_id, _ = await get_current_user_with_metadata(credentials)
    return user_id

# --- Database functions ---
async def ensure_user_exists(conn, user_id: str, supabase_user: Optional[Dict] = None):
    """Ensure user exists in database and has a room assigned"""
    try:
        existing_user = await conn.fetchrow(
            "SELECT id FROM users WHERE id = $1", user_id
        )
        if not existing_user:
            # Extract user data from Supabase user metadata
            name = 'Anonymous'
            age = None
            
            if supabase_user:
                # Get data from user_metadata (set during signup)
                user_metadata = supabase_user.get('user_metadata', {})
                name = user_metadata.get('name', 'Anonymous')
                age = user_metadata.get('age')
                
                # Fallback to raw_user_meta_data if user_metadata is empty
                if not user_metadata:
                    raw_metadata = supabase_user.get('raw_user_meta_data', {})
                    name = raw_metadata.get('name', 'Anonymous')
                    age = raw_metadata.get('age')
            
            # Create user if doesn't exist
            await conn.execute("""
                INSERT INTO users (id, name, age, onboarding, created_at, updated_at)
                VALUES ($1, $2, $3, 'Pending', NOW(), NOW())
            """, user_id, name, age)
            
            logger.info(f"Created new user: {user_id} with name: {name}, age: {age}")
        
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
    try:
        async with conn.transaction():
            session_id = await conn.fetchval("""
                INSERT INTO sessions (user_id, room_id, started_at)
                VALUES ($1, $2, NOW())
                RETURNING id
            """, user_id, room_id)
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
    try:
        async with conn.transaction():
            await conn.execute("""
                UPDATE sessions 
                SET finished_at = NOW()
                WHERE id = $1 AND user_id = $2
            """, session_id, user_id)
            await conn.execute("""
                UPDATE room 
                SET room_condition = 'off', updated_at = NOW()
                WHERE user_id = $1
            """, user_id)
            logger.info(f"Ended session {session_id} for user {user_id}")
    except Exception as e:
        logger.error(f"Error ending session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to end session")

@app.post("/api/users/profile/sync")
async def sync_user_profile_from_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    conn = Depends(get_db)
):
    """
    Sync user profile from JWT token metadata to database
    This extracts name and age from the token and stores it in the database
    """
    try:
        # Get user ID and full token payload
        user_id, token_payload = await get_current_user_with_metadata(credentials)
        
        # Extract user metadata from token
        user_metadata = token_payload.get('user_metadata', {})
        if not user_metadata:
            # Fallback to raw_user_meta_data
            user_metadata = token_payload.get('raw_user_meta_data', {})
        
        name = user_metadata.get('name', 'Anonymous')
        age = user_metadata.get('age')
        
        logger.info(f"Syncing profile for user {user_id}: name={name}, age={age}")
        
        # Ensure user exists and update profile
        await ensure_user_exists(conn, user_id, token_payload)
        
        # Update user profile with metadata from token
        await conn.execute("""
            UPDATE users 
            SET name = $1, age = $2, onboarding = 'Done', updated_at = NOW()
            WHERE id = $3
        """, name, age, user_id)
        
        # Get updated user data
        user_data = await conn.fetchrow("""
            SELECT id, name, age, onboarding, created_at, updated_at 
            FROM users 
            WHERE id = $1
        """, user_id)
        
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found after sync")
        
        return UserProfileResponse(
            user_id=str(user_data['id']), 
            name=user_data['name'],
            age=user_data['age'],
            onboarding=user_data['onboarding'],
            created_at=user_data['created_at'].isoformat(),
            updated_at=user_data['updated_at'].isoformat()
        )
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        logger.error(f"Error syncing user profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to sync user profile")
@app.post("/api/users/setup")
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

@app.post("/api/sessions/start")
async def start_session(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        room_id, room_name = await ensure_user_exists(conn, user_id)
        session_id = await create_session(conn, user_id, room_id)
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
        # Start (or restart) agent process for this room
        # if room_name in active_agents:
        #     stop_agent(room_name)
        # trigger_agent_connection(room_name)
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
    return {
        "livekit_url": LIVEKIT_URL,
        "server_status": "running"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "livekit-backend-service"}

@app.get("/ping")
async def ping():
    return {"message": "pong"}

# --- LiveKit webhook handler: STOP AGENT ON ROOM FINISHED ---
@app.post("/livekit-webhook")
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

# --- Startup and shutdown events ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL)
        logger.info("Database connection pool initialized")
        yield
    finally:
        if db_pool:
            await db_pool.close()
            logger.info("Database connection pool closed")
        # Also terminate all agent processes on shutdown
        for room, proc in active_agents.items():
            logger.info(f"Shutting down agent for room {room}, PID {proc.pid}")
            proc.terminate()
        active_agents.clear()

app.router.lifespan_context = lifespan

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)