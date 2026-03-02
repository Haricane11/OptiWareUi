"""
WebSocket relay for QR scanning.
Phone (scanner) and Laptop (receiver) join the same session.
Scanner sends scanned QR data → backend relays it to the receiver.
"""

import uuid
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/api/qr-scan", tags=["QR Scan"])

# session_id → { "receiver": WebSocket | None, "scanners": set[WebSocket] }
sessions: Dict[str, dict] = {}


@router.get("/session")
def create_session():
    """Generate a new session ID for pairing scanner ↔ receiver."""
    session_id = uuid.uuid4().hex[:8]
    return {"session_id": session_id}


@router.websocket("/ws/{session_id}")
async def qr_scan_ws(websocket: WebSocket, session_id: str, role: str = "scanner"):
    """
    WebSocket endpoint.
    Query params:
      - role: "scanner" (phone) or "receiver" (laptop)
    """
    await websocket.accept()
    print(f"WebSocket connection opened for session {session_id} with role {role}")

    # Ensure session exists
    if session_id not in sessions:
        sessions[session_id] = {"receiver": None, "scanners": set()}

    session = sessions[session_id]

    if role == "receiver":
        session["receiver"] = websocket
    else:
        session["scanners"].add(websocket)

    # Notify receiver that a scanner connected
    if role == "scanner" and session["receiver"]:
        try:
            await session["receiver"].send_json({
                "type": "scanner_connected",
                "count": len(session["scanners"]),
            })
        except Exception:
            pass

    # Notify scanner that receiver is connected
    if role == "scanner" and session["receiver"]:
        try:
            await websocket.send_json({"type": "receiver_connected"})
        except Exception:
            pass

    # If receiver joins, check for active scanners and notify receiver
    if role == "receiver":
        active_scanners = set()
        for s in list(session["scanners"]): # Iterate over a copy to allow modification
            try:
                # Attempt to send a small message to check liveness
                await s.send_json({"type": "ping"})
                active_scanners.add(s)
            except Exception:
                # If sending fails, the scanner is disconnected
                pass
        session["scanners"] = active_scanners
        try:
            await websocket.send_json({
                "type": "scanner_connected",
                "count": len(session["scanners"]),
            })
        except Exception:
            pass

    try:
        while True:
            data = await websocket.receive_json()
            print(f"Received data from {role} in session {session_id}: {data}")

            if role == "scanner" and data.get("type") == "qr_scanned":
                # Relay to receiver
                receiver = session.get("receiver")
                if receiver:
                    try:
                        await receiver.send_json({
                            "type": "qr_scanned",
                            "data": data.get("data", ""),
                            "timestamp": data.get("timestamp", ""),
                        })
                        await websocket.send_json({"type": "scan_delivered"})
                    except Exception:
                        await websocket.send_json({"type": "scan_failed", "reason": "Receiver disconnected"})
                else:
                    await websocket.send_json({"type": "scan_failed", "reason": "No receiver connected"})

    except WebSocketDisconnect:
        # Clean up
        if role == "receiver":
            session["receiver"] = None
            # Notify all scanners
            for s in list(session["scanners"]):
                try:
                    await s.send_json({"type": "receiver_disconnected"})
                except Exception:
                    session["scanners"].discard(s)
        else:
            session["scanners"].discard(websocket)
            # Notify receiver
            if session["receiver"]:
                try:
                    await session["receiver"].send_json({
                        "type": "scanner_disconnected",
                        "count": len(session["scanners"]),
                    })
                except Exception:
                    pass

        # Clean up empty sessions
        if not session["receiver"] and not session["scanners"]:
            sessions.pop(session_id, None)
