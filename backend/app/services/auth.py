import jwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from app.core.logging import logger
import os

security = HTTPBearer()
database_issuer = os.getenv("DATABASE_ISSUER")
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        logger.info(f"Attempting to decode token: {token[:20]}...")
        payload = jwt.decode(
            token, 
            settings.SUPABASE_JWT_SECRET, 
            algorithms=["HS256"],
            audience="authenticated",
            issuer=database_issuer
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