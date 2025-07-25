import os
import asyncio
import asyncpg  # type: ignore
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
from datetime import datetime, timedelta, timezone

# Payment imports
import razorpay
import hmac
import hashlib
from datetime import datetime, timedelta
from decimal import Decimal

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

# Razorpay configuration
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET')
if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    raise ValueError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required")
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# Database connection pool
db_pool = None

# --- AGENT PROCESS MANAGEMENT ---
active_agents: Dict[str, subprocess.Popen] = {}  # room_name -> process
RAZORPAY_WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET')
if not RAZORPAY_WEBHOOK_SECRET:
    raise ValueError("RAZORPAY_WEBHOOK_SECRET is required")

TRIAL_LIMIT_SECONDS=150

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

# --- Pydantic models ---
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
    trial_seconds_used: int

# Payment models
class PlanResponse(BaseModel):
    id: str
    name: str
    monthly_price: int
    monthly_limit: int
    created_at: str

class PaymentResponse(BaseModel):
    id: str
    user_id: str
    plan_id: Optional[str]
    razorpay_customer_id: str
    razorpay_subscription_id: str
    status: str
    session_limit: int
    session_used: int
    start_at: str
    end_at: Optional[str]
    next_billing_at: Optional[str]
    created_at: str
    updated_at: str

class CreateSubscriptionRequest(BaseModel):
    plan_id: str
    customer_email: str
    customer_name: Optional[str] = None

class SubscriptionWebhookPayload(BaseModel):
    event: str
    payload: dict

# --- Database connection management ---
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
        existing_user = await conn.fetchrow("SELECT id FROM users WHERE id = $1", user_id)
        if not existing_user:
            name = 'Anonymous'
            age = None
            if supabase_user:
                user_metadata = supabase_user.get('user_metadata', {})
                name = user_metadata.get('name', 'Anonymous')
                age = user_metadata.get('age')
                if not user_metadata:
                    raw_metadata = supabase_user.get('raw_user_meta_data', {})
                    name = raw_metadata.get('name', 'Anonymous')
                    age = raw_metadata.get('age')
            await conn.execute("""
                INSERT INTO users (id, name, age, onboarding, created_at, updated_at)
                VALUES ($1, $2, $3, 'Pending', NOW(), NOW())
            """, user_id, name, age)
            logger.info(f"Created new user: {user_id} with name: {name}, age: {age}")

        room = await conn.fetchrow("SELECT id, room_name FROM room WHERE user_id = $1", user_id)
        if not room:
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
            # Find the active session for the user
            session = await conn.fetchrow(
                "SELECT id, started_at FROM sessions WHERE id = $1 AND user_id = $2 AND finished_at IS NULL",
                session_id, user_id
            )
            if not session:
                logger.warning(f"Attempted to end a non-existent or already ended session: {session_id} for user {user_id}")
                return

            # Mark session as finished
            await conn.execute("""
                UPDATE sessions 
                SET finished_at = NOW()
                WHERE id = $1
            """, session_id)
            
            # Check if the user is on a paid plan. If not, update their trial usage.
            is_subscribed, _ = await check_payment_status(user_id, conn)
            
            if not is_subscribed:
                # This was a trial session, so we record the duration used.
                duration = datetime.now(timezone.utc) - session['started_at']
                duration_seconds = int(duration.total_seconds())

                await conn.execute(
                    "UPDATE users SET trial_seconds_used = trial_seconds_used + $1 WHERE id = $2",
                    duration_seconds, user_id
                )
                logger.info(f"Recorded {duration_seconds}s of trial usage for user {user_id}")
            else:
                # This was a paid session, no need to update trial usage.
                logger.info(f"User {user_id} is subscribed, not updating trial usage.")

            # Set room condition to 'off'
            await conn.execute("""
                UPDATE room 
                SET room_condition = 'off', updated_at = NOW()
                WHERE user_id = $1
            """, user_id)
            
            logger.info(f"Ended session {session_id} for user {user_id}")
    except Exception as e:
        logger.error(f"Error ending session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to end session")

# --- Payment utility ---
def verify_razorpay_signature(payload_body: bytes, signature: str, secret: str) -> bool:
    """Verify Razorpay webhook signature"""
    try:
        expected_signature = hmac.new(
            secret.encode('utf-8'),
            payload_body,
            hashlib.sha256
        ).hexdigest()

        # Razorpay sends signature in format: "sha256=hash"
        # Extract just the hash part
        if signature.startswith('sha256='):
            signature = signature[7:]
        
        return hmac.compare_digest(expected_signature, signature)
    except Exception as e:
        logger.error(f"Signature verification error: {e}")
        return False

# --- Payment/check logic ---
async def check_payment_status(user_id: str, conn) -> tuple[bool, str]:
    """Check if user has active payment and available sessions"""
    try:
        payment = await conn.fetchrow("""
            SELECT session_limit, session_used, status, end_at, next_billing_at, razorpay_subscription_id
            FROM payments
            WHERE user_id = $1 AND status IN ('active', 'past_due', 'active', 'created')
            ORDER BY created_at DESC
            LIMIT 1
        """, user_id)

        if not payment:
            return False, "No active subscription found"
        
        # Handle created status - check with Razorpay for current status
        if payment['status'] == 'created':
            try:
                # Check current status with Razorpay
                subscription = razorpay_client.subscription.fetch(payment['razorpay_subscription_id'])
                razorpay_status = subscription.get('status')
                
                logger.info(f"Razorpay subscription status: {razorpay_status}")
                
                # Update local status if Razorpay shows different status
                if razorpay_status in ['authenticated', 'active']:
                    await conn.execute("""
                        UPDATE payments 
                        SET status = 'active', updated_at = NOW()
                        WHERE razorpay_subscription_id = $1
                    """, payment['razorpay_subscription_id'])
                    # Update payment dict for further checks
                    payment = dict(payment)
                    payment['status'] = 'active'
                    logger.info(f"Updated local payment status to active for subscription {payment['razorpay_subscription_id']}")
                    
                elif razorpay_status == 'pending':
                    return False, "Payment is pending - please complete the payment"
                    
                elif razorpay_status == 'halted':
                    return False, "Subscription has been halted due to payment issues"
                    
                else:
                    return False, f"Subscription status: {razorpay_status}"
                    
            except Exception as e:
                logger.error(f"Error checking Razorpay status: {str(e)}")
                return False, "Unable to verify subscription status"
        
        # Check if subscription has expired
        if payment['end_at'] and payment['end_at'] < datetime.utcnow().replace(tzinfo=None):
            return False, "Subscription has expired"
        
        # Check session limits
        if payment['session_used'] >= payment['session_limit']:
            return False, "Session limit exceeded for current billing cycle"
        
        # Handle past_due status (grace period)
        if payment['status'] == 'past_due':
            # Allow limited usage during grace period (e.g., 3 days)
            grace_period = timedelta(days=3)
            if payment['next_billing_at'] and (datetime.utcnow().replace(tzinfo=None) - payment['next_billing_at']) > grace_period:
                return False, "Payment overdue beyond grace period"
        
        if payment['status'] == 'active':
             return True, "Active subscription"

        return False, "Subscription not active"
        
    except Exception as e:
        logger.error(f"Error checking payment status: {str(e)}")
        return False, "Error checking subscription status"

# --- ROUTES ---
@app.post("/api/users/profile/sync")
async def sync_user_profile_from_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    conn = Depends(get_db)
):
    try:
        user_id, token_payload = await get_current_user_with_metadata(credentials)
        user_metadata = token_payload.get('user_metadata', {})
        if not user_metadata:
            user_metadata = token_payload.get('raw_user_meta_data', {})
        name = user_metadata.get('name', 'Anonymous')
        age = user_metadata.get('age')
        logger.info(f"Syncing profile for user {user_id}: name={name}, age={age}")
        await ensure_user_exists(conn, user_id, token_payload)
        await conn.execute("""
            UPDATE users
            SET name = $1, age = $2, onboarding = 'Done', updated_at = NOW()
            WHERE id = $3
        """, name, age, user_id)
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
        raise
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
        # 1. Check for an active subscription first.
        is_subscribed, payment_message = await check_payment_status(user_id, conn)

        if is_subscribed:
            # --- PAID USER LOGIC ---
            logger.info(f"User {user_id} has an active subscription. Starting paid session.")
            
            # Ensure user and room exist
            room_id, room_name = await ensure_user_exists(conn, user_id)
            session_id = await create_session(conn, user_id, room_id)

            # Increment paid session usage
            await conn.execute(
                """
                UPDATE payments 
                SET session_used = session_used + 1, updated_at = NOW() 
                WHERE user_id = $1 AND status IN ('active', 'past_due')
                """,
                user_id
            )
            logger.info(f"Incremented paid session usage for user {user_id}")

        else:
            # --- TRIAL USER LOGIC ---
            logger.info(f"User {user_id} has no active subscription. Checking trial status.")
            
            # Fetch user's trial status
            user = await conn.fetchrow("SELECT trial_seconds_used FROM users WHERE id = $1", user_id)
            if not user:
                 # This should be handled by ensure_user_exists, but as a safeguard:
                await ensure_user_exists(conn, user_id)
                user = await conn.fetchrow("SELECT trial_seconds_used FROM users WHERE id = $1", user_id)

            if not user:
                raise HTTPException(status_code=404, detail="User not found.")
            
            # Check if trial is exhausted
            if user['trial_seconds_used'] >= TRIAL_LIMIT_SECONDS:
                logger.warning(f"User {user_id} has exhausted trial ({user['trial_seconds_used']}s) and has no subscription.")
                raise HTTPException(status_code=403, detail="Your free trial has ended. Please subscribe to continue.")
            
            logger.info(f"User {user_id} has {TRIAL_LIMIT_SECONDS - user['trial_seconds_used']}s of trial remaining.")
            
            # Proceed with trial session
            room_id, room_name = await ensure_user_exists(conn, user_id)
            session_id = await create_session(conn, user_id, room_id)

        # 5. If all checks pass, generate LiveKit token and return response
        token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET) \
            .with_identity(user_id) \
            .with_name(f"user_{user_id}") \
            .with_grants(api.VideoGrants(room_join=True, room=room_name, room_create=True))

        return SessionResponse(
            session_id=session_id,
            room_name=room_name,
            room_id=room_id,
            token=token.to_jwt(),
            livekit_url=LIVEKIT_URL
        )

    except HTTPException:
        raise
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

@app.get("/api/users/room", response_model=RoomInfo)
async def get_user_room(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        # Join with users table to get trial usage
        user_room_info = await conn.fetchrow("""
            SELECT r.id, r.room_name, r.room_condition, u.trial_seconds_used
            FROM room r
            JOIN users u ON r.user_id = u.id
            WHERE r.user_id = $1
        """, user_id)

        if not user_room_info:
            # If user has no room, ensure one is created and re-fetch
            await ensure_user_exists(conn, user_id)
            user_room_info = await conn.fetchrow("""
                SELECT r.id, r.room_name, r.room_condition, u.trial_seconds_used
                FROM room r
                JOIN users u ON r.user_id = u.id
                WHERE r.user_id = $1
            """, user_id)

        if not user_room_info:
             raise HTTPException(status_code=404, detail="Could not find or create room for user.")

        return RoomInfo(
            room_id=str(user_room_info['id']),
            room_name=user_room_info['room_name'],
            room_condition=user_room_info['room_condition'],
            trial_seconds_used=user_room_info['trial_seconds_used']
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

# --- Payment endpoints ---
@app.get("/api/plans", response_model=list[PlanResponse])
async def get_plans(conn = Depends(get_db)):
    try:
        plans = await conn.fetch("""
            SELECT id, name, monthly_price, monthly_limit, created_at
            FROM plans
            ORDER BY monthly_price ASC
        """)
        return [
            PlanResponse(
                id=str(plan['id']),
                name=plan['name'],
                monthly_price=plan['monthly_price'],
                monthly_limit=plan['monthly_limit'],
                created_at=plan['created_at'].isoformat()
            )
            for plan in plans
        ]
    except Exception as e:
        logger.error(f"Error fetching plans: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch plans")

@app.post("/api/payments/create-customer")
async def create_razorpay_customer(
    customer_data: dict,
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        user = await conn.fetchrow("SELECT name FROM users WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        customer_data_razorpay = {
            "name": user['name'],
            "email": customer_data.get("email"),
            "contact": customer_data.get("phone", ""),
            "notes": {
                "user_id": user_id
            }
        }
        customer = razorpay_client.customer.create(customer_data_razorpay)
        return {
            "customer_id": customer["id"],
            "status": "created"
        }
    except Exception as e:
        logger.error(f"Error creating Razorpay customer: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create customer")

@app.post("/api/payments/create-subscription")
async def create_subscription(
    request: CreateSubscriptionRequest,
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        # Get plan details from your database
        plan = await conn.fetchrow("""
            SELECT id, name, monthly_price, monthly_limit, razorpay_plan_id
            FROM plans WHERE id = $1
        """, request.plan_id)

        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Get user details
        user = await conn.fetchrow("SELECT name FROM users WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Check if customer already exists in your database
        existing_customer = await conn.fetchrow("""
            SELECT razorpay_customer_id 
            FROM payments 
            WHERE user_id = $1 AND razorpay_customer_id IS NOT NULL
            LIMIT 1
        """, user_id)

        customer_id = None
        
        if existing_customer:
            customer_id = existing_customer['razorpay_customer_id']
            logger.info(f"Using existing customer: {customer_id}")
            
            # Verify customer still exists in Razorpay
            try:
                customer = razorpay_client.customer.fetch(customer_id)
                logger.info(f"Existing customer verified: {customer_id}")
            except Exception as e:
                logger.warning(f"Existing customer {customer_id} not found in Razorpay: {str(e)}")
                customer_id = None
        
        # Create new customer if none exists or existing one is invalid
        if not customer_id:
            customer_data = {
                "name": request.customer_name or user['name'],
                "email": request.customer_email,
                "contact": "",  # Optional field
                "notes": {
                    "user_id": user_id
                }
            }
            
            logger.info(f"Creating new customer with data: {customer_data}")
            customer = razorpay_client.customer.create(customer_data)
            customer_id = customer['id']
            logger.info(f"New customer created: {customer_id}")

        # Handle Razorpay plan creation/retrieval
        razorpay_plan_id = plan.get('razorpay_plan_id')
        
        if not razorpay_plan_id:
            # Create plan in Razorpay if not exists
            try:
                razorpay_plan_data = {
                    "period": "monthly",
                    "interval": 1,
                    "item": {
                        "name": plan['name'],
                        "amount": plan['monthly_price'] * 100,  # Convert to paise
                        "currency": "INR"
                    },
                    "notes": {
                        "plan_id": str(plan['id'])
                    }
                }
                
                logger.info(f"Creating Razorpay plan with data: {razorpay_plan_data}")
                razorpay_plan = razorpay_client.plan.create(razorpay_plan_data)
                razorpay_plan_id = razorpay_plan["id"]
                
                # Update your database with the Razorpay plan ID
                await conn.execute("""
                    UPDATE plans 
                    SET razorpay_plan_id = $1, updated_at = NOW()
                    WHERE id = $2
                """, razorpay_plan_id, plan['id'])
                
                logger.info(f"Razorpay plan created: {razorpay_plan_id}")
                
            except Exception as e:
                logger.error(f"Error creating Razorpay plan: {str(e)}")
                # If plan creation fails, try to find existing plan
                try:
                    plans = razorpay_client.plan.all()
                    existing_plan = None
                    for rp in plans['items']:
                        if (rp['item']['name'] == plan['name'] and 
                            rp['item']['amount'] == plan['monthly_price'] * 100):
                            existing_plan = rp
                            break
                    
                    if existing_plan:
                        razorpay_plan_id = existing_plan['id']
                        await conn.execute("""
                            UPDATE plans 
                            SET razorpay_plan_id = $1, updated_at = NOW()
                            WHERE id = $2
                        """, razorpay_plan_id, plan['id'])
                    else:
                        raise HTTPException(
                            status_code=500, 
                            detail=f"Failed to create or find Razorpay plan: {str(e)}"
                        )
                except Exception as fallback_error:
                    logger.error(f"Fallback plan search failed: {str(fallback_error)}")
                    raise HTTPException(
                        status_code=500, 
                        detail="Failed to create subscription plan"
                    )

        # Create subscription
        subscription_data = {
            "plan_id": razorpay_plan_id,
            "customer_id": customer_id,
            "quantity": 1,
            "total_count": 1,  # 1 month
            "customer_notify": 1,
            "start_at": int((datetime.now(timezone.utc) + timedelta(minutes=1)).timestamp()),
            "notes": {
                "user_id": user_id,
                "plan_id": request.plan_id
            }
        }
        
        logger.info(f"Creating subscription with data: {subscription_data}")
        subscription = razorpay_client.subscription.create(subscription_data)
        logger.info(f"Subscription created: {subscription['id']}")

        # Store in database
        start_at = datetime.utcnow()
        next_billing_at = start_at + timedelta(days=30)
        
        payment_id = await conn.fetchval("""
            INSERT INTO payments (
                user_id, plan_id, razorpay_customer_id, razorpay_subscription_id,
                status, session_limit, session_used, start_at, next_billing_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        """, 
            user_id, request.plan_id, customer_id, subscription["id"],
            "created",  # Initial status
            plan['monthly_limit'], 0, start_at, next_billing_at
        )

        return {
            "subscription_id": subscription["id"],
            "payment_id": str(payment_id),
            "short_url": subscription.get("short_url"),
            "status": subscription["status"],
            "customer_id": customer_id,
            "plan_id": razorpay_plan_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating subscription: {str(e)}")
        logger.error(f"Exception type: {type(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create subscription: {str(e)}")
@app.get("/api/payments/current", response_model=PaymentResponse)
async def get_current_payment(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        payment = await conn.fetchrow("""
            SELECT p.*, pl.name as plan_name
            FROM payments p
            LEFT JOIN plans pl ON p.plan_id = pl.id
            WHERE p.user_id = $1 AND p.status = 'active'
            ORDER BY p.created_at DESC
            LIMIT 1
        """, user_id)

        if not payment:
            raise HTTPException(status_code=404, detail="No active payment found")
        
        return PaymentResponse(
            id=str(payment['id']),
            user_id=str(payment['user_id']),
            plan_id=str(payment['plan_id']) if payment['plan_id'] else None,
            razorpay_customer_id=payment['razorpay_customer_id'],
            razorpay_subscription_id=payment['razorpay_subscription_id'],
            status=payment['status'],
            session_limit=payment['session_limit'],
            session_used=payment['session_used'],
            start_at=payment['start_at'].isoformat(),
            end_at=payment['end_at'].isoformat() if payment['end_at'] else None,
            next_billing_at=payment['next_billing_at'].isoformat() if payment['next_billing_at'] else None,
            created_at=payment['created_at'].isoformat(),
            updated_at=payment['updated_at'].isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching current payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch payment details")

@app.get("/api/payments/history")
async def get_payment_history(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        payments = await conn.fetch("""
            SELECT p.*, pl.name as plan_name
            FROM payments p
            LEFT JOIN plans pl ON p.plan_id = pl.id
            WHERE p.user_id = $1
            ORDER BY p.created_at DESC
        """, user_id)
        return [
            {
                "id": str(payment['id']),
                "plan_name": payment['plan_name'],
                "status": payment['status'],
                "session_limit": payment['session_limit'],
                "session_used": payment['session_used'],
                "start_at": payment['start_at'].isoformat(),
                "end_at": payment['end_at'].isoformat() if payment['end_at'] else None,
                "created_at": payment['created_at'].isoformat()
            }
            for payment in payments
        ]
    except Exception as e:
        logger.error(f"Error fetching payment history: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch payment history")

@app.post("/api/payments/cancel-subscription")
async def cancel_subscription(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        payment = await conn.fetchrow("""
            SELECT razorpay_subscription_id, id
            FROM payments
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        """, user_id)
        if not payment:
            raise HTTPException(status_code=404, detail="No active subscription found")
        razorpay_client.subscription.cancel(payment['razorpay_subscription_id'])
        await conn.execute("""
            UPDATE payments
            SET status = 'cancelled', updated_at = NOW()
            WHERE id = $1
        """, payment['id'])
        return {"status": "cancelled", "message": "Subscription cancelled successfully"}
    except Exception as e:
        logger.error(f"Error cancelling subscription: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel subscription")

@app.post("/api/payments/usage/increment")
async def increment_session_usage(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        payment = await conn.fetchrow("""
            SELECT id, session_limit, session_used
            FROM payments
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        """, user_id)
        if not payment:
            raise HTTPException(status_code=404, detail="No active payment plan found")
        if payment['session_used'] >= payment['session_limit']:
            raise HTTPException(status_code=403, detail="Session limit exceeded")
        new_usage = await conn.fetchval("""
            UPDATE payments
            SET session_used = session_used + 1, updated_at = NOW()
            WHERE id = $1
            RETURNING session_used
        """, payment['id'])
        return {
            "session_used": new_usage,
            "session_limit": payment['session_limit'],
            "remaining": payment['session_limit'] - new_usage
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error incrementing session usage: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update usage")

@app.get("/api/payments/usage")
async def get_usage_stats(
    user_id: str = Depends(get_current_user),
    conn = Depends(get_db)
):
    try:
        payment = await conn.fetchrow("""
            SELECT session_limit, session_used, status, next_billing_at
            FROM payments
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        """, user_id)
        if not payment:
            return {
                "session_limit": 0,
                "session_used": 0,
                "remaining": 0,
                "status": "no_plan",
                "next_billing_at": None
            }
        remaining = payment['session_limit'] - payment['session_used']
        return {
            "session_limit": payment['session_limit'],
            "session_used": payment['session_used'],
            "remaining": remaining,
            "status": payment['status'],
            "next_billing_at": payment['next_billing_at'].isoformat() if payment['next_billing_at'] else None
        }
    except Exception as e:
        logger.error(f"Error fetching usage stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage statistics")

@app.post("/api/payments/webhook")
async def razorpay_webhook(request: Request, conn = Depends(get_db)):
    try:
        body = await request.body()
        signature = request.headers.get('X-Razorpay-Signature')

        # Only verify with webhook secret, not API secret
        if not signature or not verify_razorpay_signature(body, signature, RAZORPAY_WEBHOOK_SECRET):
            logger.error("Invalid webhook signature")
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        payload = await request.json()
        event = payload.get('event')
        
        logger.info(f"Received webhook event: {event}")
        logger.info(f"Full payload: {payload}")
        
        # Extract entity data based on the correct Razorpay webhook structure
        subscription_data = None
        payment_data = None
        subscription_id = None
        
        # Handle the nested structure correctly
        payload_data = payload.get('payload', {})
        
        # For subscription events
        if 'subscription' in payload_data:
            subscription_payload = payload_data['subscription']
            # Handle both possible structures
            if 'entity' in subscription_payload:
                subscription_data = subscription_payload['entity']
            else:
                subscription_data = subscription_payload
            subscription_id = subscription_data.get('id')
        
        # For payment events
        if 'payment' in payload_data:
            payment_payload = payload_data['payment']
            if 'entity' in payment_payload:
                payment_data = payment_payload['entity']
            else:
                payment_data = payment_payload
            
            # For payment events, we might need to get subscription ID from payment data
            if not subscription_id:
                subscription_id = payment_data.get('subscription_id')
        
        # Alternative extraction method for direct entity structure
        if not subscription_id:
            entity_data = payload_data.get('entity', {})
            if entity_data.get('entity') == 'subscription':
                subscription_data = entity_data
                subscription_id = entity_data.get('id')
        
        logger.info(f"Extracted subscription ID: {subscription_id}")
        logger.info(f"Subscription data: {subscription_data}")
        
        if not subscription_id:
            logger.warning("No subscription ID found in webhook payload")
            logger.warning(f"Payload structure: {payload}")
            return {"status": "ignored", "reason": "no subscription id"}
        
        # Handle different webhook events
        if event == 'subscription.activated':
            await handle_subscription_activated(conn, subscription_id, subscription_data)
            
        elif event == 'subscription.charged':
            await handle_subscription_charged(conn, subscription_id, subscription_data, payment_data)
            
        elif event == 'subscription.authenticated':
            # This event fires when subscription is created and authenticated
            await handle_subscription_authenticated(conn, subscription_id, subscription_data)
            
        elif event == 'subscription.charge_failed':
            await handle_charge_failed(conn, subscription_id, subscription_data)
            
        elif event == 'subscription.cancelled':
            await handle_subscription_cancelled(conn, subscription_id)
            
        elif event == 'subscription.completed':
            # Map completed to cancelled since you don't have 'completed' in enum
            await handle_subscription_cancelled(conn, subscription_id)
            
        elif event == 'subscription.paused':
            await handle_subscription_paused(conn, subscription_id)
            
        elif event == 'subscription.resumed':
            await handle_subscription_resumed(conn, subscription_id)
        
        else:
            logger.info(f"Unhandled webhook event: {event}")
        
        return {"status": "processed", "event": event}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}")
        logger.error(f"Request body: {body}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Webhook processing failed")

async def handle_subscription_authenticated(conn, subscription_id: str, subscription_data: dict):
    """Handle subscription authentication (moves from created to active)"""
    try:
        # Log the subscription data for debugging
        logger.info(f"Processing authentication for subscription {subscription_id}")
        logger.info(f"Subscription status in webhook: {subscription_data.get('status') if subscription_data else 'No data'}")

        # Update status to active when subscription is authenticated
        # Note: Using only valid enum values from your database
        result = await conn.execute("""
            UPDATE payments 
            SET status = 'active', updated_at = NOW()
            WHERE razorpay_subscription_id = $1
        """, subscription_id)
        
        # Check how many rows were updated
        rows_updated = int(result.split()[-1]) if result.startswith('UPDATE') else 0
        
        if rows_updated > 0:
            logger.info(f"Subscription {subscription_id} activated via authentication event - {rows_updated} rows updated")
        else:
            logger.warning(f"No payment record found for subscription {subscription_id} in created/authenticated status")
            
            # Debug: Check if the subscription exists with a different status
            existing_payment = await conn.fetchrow("""
                SELECT id, user_id, status, razorpay_subscription_id 
                FROM payments 
                WHERE razorpay_subscription_id = $1
            """, subscription_id)
            
            if existing_payment:
                logger.info(f"Found existing payment record with status: {existing_payment['status']}")
                # If it exists but with wrong status, let's update it anyway
                if existing_payment['status'] in ['created']:
                    await conn.execute("""
                        UPDATE payments 
                        SET status = 'active', updated_at = NOW()
                        WHERE razorpay_subscription_id = $1
                    """, subscription_id)
                    logger.info(f"Force updated subscription {subscription_id} to active status")
            else:
                logger.error(f"No payment record found at all for subscription {subscription_id}")
            
    except Exception as e:
        logger.error(f"Error handling subscription authentication: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")

async def handle_subscription_activated(conn, subscription_id: str, subscription_data: dict):
    """Handle subscription activation"""
    try:
        if not subscription_data:
            logger.warning(f"No subscription data provided for activation of {subscription_id}")
            return

        start_time = subscription_data.get('start_at')
        if start_time:
            start_dt = datetime.fromtimestamp(start_time, tz=timezone.utc)
        else:
            start_dt = datetime.now(timezone.utc)
        
        result = await conn.execute("""
            UPDATE payments 
            SET status = 'active', start_at = $1, updated_at = NOW()
            WHERE razorpay_subscription_id = $2
        """, start_dt, subscription_id)
        
        rows_updated = int(result.split()[-1]) if result.startswith('UPDATE') else 0
        logger.info(f"Subscription {subscription_id} activated, rows affected: {rows_updated}")
        
    except Exception as e:
        logger.error(f"Error activating subscription {subscription_id}: {str(e)}")

async def handle_subscription_charged(conn, subscription_id: str, subscription_data: dict, payment_data: dict):
    """Handle successful subscription charge"""
    try:
        if not subscription_data:
            logger.warning(f"No subscription data provided for charge of {subscription_id}")
            return

        next_billing = subscription_data.get('next_billing_at')
        amount = payment_data.get('amount', 0) if payment_data else 0
        
        # Get current payment record to check if we should reset sessions
        current_payment = await conn.fetchrow("""
            SELECT session_used, session_limit, last_reset_at, status
            FROM payments 
            WHERE razorpay_subscription_id = $1
        """, subscription_id)
        
        if not current_payment:
            logger.error(f"No payment record found for subscription {subscription_id}")
            return
        
        # Determine if this is a new billing cycle
        should_reset_sessions = True
        if current_payment['last_reset_at']:
            # Check if we've already reset sessions for this billing cycle
            last_reset = current_payment['last_reset_at']
            if (datetime.now(timezone.utc) - last_reset).days < 25:  # Less than 25 days since last reset
                should_reset_sessions = False
        
        update_query = """
            UPDATE payments 
            SET status = 'active', 
                next_billing_at = $1,
                last_payment_amount = $2,
                last_payment_at = NOW(),
                updated_at = NOW()
        """
        params = [datetime.fromtimestamp(next_billing, tz=timezone.utc) if next_billing else None, amount]
        
        if should_reset_sessions:
            update_query += ", session_used = 0, last_reset_at = NOW()"
        
        update_query += " WHERE razorpay_subscription_id = $3"
        params.append(subscription_id)
        
        result = await conn.execute(update_query, *params)
        
        rows_updated = int(result.split()[-1]) if result.startswith('UPDATE') else 0
        logger.info(f"Subscription {subscription_id} charged successfully. Sessions reset: {should_reset_sessions}, rows affected: {rows_updated}")
        
    except Exception as e:
        logger.error(f"Error handling subscription charge for {subscription_id}: {str(e)}")

async def handle_charge_failed(conn, subscription_id: str, subscription_data: dict):
    """Handle failed subscription charge"""
    try:
        await conn.execute("""
            UPDATE payments
            SET status = 'failed', updated_at = NOW()
            WHERE razorpay_subscription_id = $1
        """, subscription_id)

        # Optional: Send notification to user about failed payment
        logger.warning(f"Subscription {subscription_id} charge failed - marked as failed")
    except Exception as e:
        logger.error(f"Error handling charge failed for {subscription_id}: {str(e)}")

async def handle_subscription_cancelled(conn, subscription_id: str):
    """Handle subscription cancellation"""
    try:
        await conn.execute("""
            UPDATE payments
            SET status = 'cancelled', end_at = NOW(), updated_at = NOW()
            WHERE razorpay_subscription_id = $1
        """, subscription_id)

        logger.info(f"Subscription {subscription_id} cancelled")
    except Exception as e:
        logger.error(f"Error handling subscription cancellation for {subscription_id}: {str(e)}")

async def handle_subscription_completed(conn, subscription_id: str):
    """Handle subscription completion (natural end)"""
    try:
        # Map completed to cancelled since you don't have 'completed' in enum
        await conn.execute("""
            UPDATE payments
            SET status = 'cancelled', end_at = NOW(), updated_at = NOW()
            WHERE razorpay_subscription_id = $1
        """, subscription_id)

        logger.info(f"Subscription {subscription_id} completed")
    except Exception as e:
        logger.error(f"Error handling subscription completion for {subscription_id}: {str(e)}")

async def handle_subscription_paused(conn, subscription_id: str):
    """Handle subscription pause"""
    try:
        await conn.execute("""
            UPDATE payments
            SET status = 'paused', updated_at = NOW()
            WHERE razorpay_subscription_id = $1
        """, subscription_id)

        logger.info(f"Subscription {subscription_id} paused")
    except Exception as e:
        logger.error(f"Error handling subscription pause for {subscription_id}: {str(e)}")

async def handle_subscription_resumed(conn, subscription_id: str):
    """Handle subscription resume"""
    try:
        await conn.execute("""
            UPDATE payments
            SET status = 'active', updated_at = NOW()
            WHERE razorpay_subscription_id = $1
        """, subscription_id)

        logger.info(f"Subscription {subscription_id} resumed")
    except Exception as e:
        logger.error(f"Error handling subscription resume for {subscription_id}: {str(e)}")

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
        for room, proc in list(active_agents.items()):
            logger.info(f"Shutting down agent for room {room}, PID {proc.pid}")
            proc.terminate()
        active_agents.clear()

app.router.lifespan_context = lifespan

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)