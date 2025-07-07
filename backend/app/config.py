import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Database
    DATABASE_URL = os.getenv('DATABASE_URL')
    
    # LiveKit
    LIVEKIT_API_KEY = os.getenv('LIVEKIT_API_KEY')
    LIVEKIT_API_SECRET = os.getenv('LIVEKIT_API_SECRET')
    LIVEKIT_URL = os.getenv('LIVEKIT_URL', 'wss://localhost:7880')
    
    # Supabase
    SUPABASE_JWT_SECRET = os.getenv('SUPABASE_JWT_SECRET')
    
    # Validation
    def validate(self):
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL environment variable is required")
        if not self.LIVEKIT_API_KEY or not self.LIVEKIT_API_SECRET:
            raise ValueError("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required")
        if not self.SUPABASE_JWT_SECRET:
            raise ValueError("SUPABASE_JWT_SECRET is required")

settings = Settings()
settings.validate()