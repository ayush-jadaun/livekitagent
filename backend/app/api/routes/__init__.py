from fastapi import APIRouter
from . import users, sessions, rooms, webhooks

api_router = APIRouter()
api_router.include_router(users.router)
api_router.include_router(sessions.router)
api_router.include_router(rooms.router)
api_router.include_router(webhooks.router)