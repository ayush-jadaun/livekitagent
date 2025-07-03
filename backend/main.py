
import os
from livekit import api # type: ignore
from fastapi import FastAPI, Query, Request # type: ignore
from fastapi.responses import PlainTextResponse, JSONResponse # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from dotenv import load_dotenv # type: ignore

load_dotenv()

app = FastAPI()

#
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/getToken", response_class=PlainTextResponse)
def get_token(
    room: str = Query(default="my-room", description="Room name to join"),
    identity: str = Query(default="user", description="User identity"),
    name: str = Query(default="Anonymous", description="User display name")
):
    """Generate a LiveKit access token for joining a room"""
    try:
        token = api.AccessToken(
            os.getenv('LIVEKIT_API_KEY'),
            os.getenv('LIVEKIT_API_SECRET')
        ).with_identity(identity) \
         .with_name(name) \
         .with_grants(api.VideoGrants(
             room_join=True,
             room=room,
             room_create=True,  # Allow creating rooms
         ))
        print(token.to_jwt())
        return token.to_jwt()
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to generate token: {str(e)}"}
        )
    
@app.post("/livekit-webhook")
async def livekit_webhook(request: Request):
    payload = await request.json()
    event = payload.get("event")
    if event == "room_started":
        room_name = payload["room"]["name"]
   
        import subprocess
        subprocess.Popen([
            "python", "agent.py", "connect","--room", room_name
        ])
    return {"status": "received"}

@app.get("/config")
def get_config():
    """Return LiveKit server configuration"""
    return {
        "livekit_url": os.getenv('LIVEKIT_URL', 'wss://localhost:7880'),
        "server_status": "running"
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "livekit-token-server"}

if __name__ == "__main__":
    import uvicorn # type: ignore
    uvicorn.run(app, host="0.0.0.0", port=8000)