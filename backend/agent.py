from dotenv import load_dotenv
import os

load_dotenv()

from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import (
    google,
    cartesia,
    deepgram,
    noise_cancellation,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

print("DEEPGRAM_API_KEY =", os.getenv("DEEPGRAM_API_KEY"))

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="You are a helpful voice AI assistant.")

    async def on_transcribe(self, text: str, **kwargs):
        print(f"[TRANSCRIPT] {text}")
        await super().on_transcribe(text, **kwargs)

    async def on_say(self, text: str, **kwargs):
        print(f"[AGENT REPLY] {text}")
        await super().on_say(text, **kwargs)

async def entrypoint(ctx: agents.JobContext):
    stt_plugin = deepgram.STT(model="nova-3", language="multi")

    session = AgentSession(
        stt=stt_plugin,
        llm=google.LLM(model="gemini-2.0-flash-exp"),
        tts=cartesia.TTS(model="sonic-2", voice="f786b574-daa5-4673-aa0c-cbe3e8534c02"),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    await ctx.connect()
    await session.generate_reply(
        instructions="Greet the user and offer your assistance."
    )

if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))