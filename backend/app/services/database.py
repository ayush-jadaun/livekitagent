import asyncpg
from typing import Optional, Dict
from fastapi import HTTPException
from app.config import settings
from app.core.logging import logger

# Database connection pool
db_pool = None

async def get_db_pool():
    global db_pool
    if db_pool is None:
        db_pool = await asyncpg.create_pool(settings.DATABASE_URL)
    return db_pool

async def get_db():
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        yield conn

async def ensure_user_exists(conn, user_id: str, user_data: Optional[Dict] = None):
    try:
        existing_user = await conn.fetchrow(
            "SELECT id FROM users WHERE id = $1", user_id
        )
        if not existing_user:
            name = user_data.get('name', 'Anonymous') if user_data else 'Anonymous'
            age = user_data.get('age') if user_data else None
            await conn.execute("""
                INSERT INTO users (id, name, age, onboarding, created_at, updated_at)
                VALUES ($1, $2, $3, 'Pending', NOW(), NOW())
            """, user_id, name, age)
            logger.info(f"Created new user: {user_id}")
        
        room = await conn.fetchrow(
            "SELECT id, room_name FROM room WHERE user_id = $1", user_id
        )
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

async def close_db_pool():
    global db_pool
    if db_pool:
        await db_pool.close()
        logger.info("Database connection pool closed")