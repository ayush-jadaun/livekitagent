import subprocess
from typing import Dict
from app.core.logging import logger

# Agent process management
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

def cleanup_all_agents():
    """Terminate all agent processes."""
    for room, proc in active_agents.items():
        logger.info(f"Shutting down agent for room {room}, PID {proc.pid}")
        proc.terminate()
    active_agents.clear()