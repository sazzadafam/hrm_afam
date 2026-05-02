from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import Optional, List
from app.core.database import get_db
from app.core.auth import roles_required, get_current_user
from app.models.event import Event
from pydantic import BaseModel
from datetime import datetime
import asyncio
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# WebSocket Connection Manager (thread-safe)
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.active.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            if ws in self.active:
                self.active.remove(ws)

    async def broadcast(self, message: dict):
        """Send to all connections; silently drop any that have disconnected."""
        dead = []
        async with self._lock:
            targets = list(self.active)           # snapshot to avoid mutation mid-loop

        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)

        # Clean up dead connections
        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self.active:
                        self.active.remove(ws)


manager = ConnectionManager()


@router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive; we don't need client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
        await manager.disconnect(websocket)


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    location:    Optional[str] = None
    start_date:  datetime
    end_date:    Optional[datetime] = None
    is_holiday:  bool = False
    type:        str = "event"          # "event" | "announcement" | "holiday"


class EventUpdate(BaseModel):
    title:       Optional[str]      = None
    description: Optional[str]      = None
    location:    Optional[str]      = None
    start_date:  Optional[datetime] = None
    end_date:    Optional[datetime] = None
    is_holiday:  Optional[bool]     = None
    type:        Optional[str]      = None


# ---------------------------------------------------------------------------
# POST /  — Create event (admin only)
# ---------------------------------------------------------------------------

@router.post("/")
async def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    current_user = Depends(roles_required(["admin"]))
):
    new_event = Event(**event.dict())
    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    # Notify all connected clients so the UI updates without a refresh
    await manager.broadcast({
        "type":       "new_event",
        "id":         new_event.id,
        "title":      new_event.title,
        "event_type": new_event.type,
    })

    return new_event


# ---------------------------------------------------------------------------
# GET /  — List events (all authenticated roles)
# ---------------------------------------------------------------------------

@router.get("/")
def get_events(
    db: Session = Depends(get_db),
    current_user = Depends(roles_required(["admin", "read_only_admin", "auditor", "staff", "employee"]))
):
    return db.query(Event).order_by(Event.start_date.asc()).all()


# ---------------------------------------------------------------------------
# GET /{event_id}  — Single event
# ---------------------------------------------------------------------------

@router.get("/{event_id}")
def get_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(roles_required(["admin", "read_only_admin", "auditor", "staff", "employee"]))
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


# ---------------------------------------------------------------------------
# PUT /{event_id}  — Update event (admin only)   ← THIS WAS MISSING
# ---------------------------------------------------------------------------

@router.put("/{event_id}")
async def update_event(
    event_id: int,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(roles_required(["admin"]))
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Only update fields that were actually sent (partial update)
    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)

    # Notify connected clients of the update
    await manager.broadcast({
        "type":       "updated_event",
        "id":         event.id,
        "title":      event.title,
        "event_type": event.type,
    })

    return event


# ---------------------------------------------------------------------------
# DELETE /{event_id}  — Delete event (admin only)
# ---------------------------------------------------------------------------

@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(roles_required(["admin"]))
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()

    await manager.broadcast({
        "type":     "deleted_event",
        "id":       event_id,
    })

    return {"message": "Event deleted successfully"}











# from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
# from sqlalchemy.orm import Session
# from typing import Optional, List
# from app.core.database import get_db
# # Use roles_required for multi-role support
# from app.core.auth import roles_required, get_current_user 
# from app.models.event import Event
# from pydantic import BaseModel
# from datetime import datetime
# import smtplib
# from email.mime.text import MIMEText
# import os

# router = APIRouter()

# # WebSocket Connection Manager

# active_connections: List[WebSocket] = []

# async def broadcast_notification(message: dict):
#     disconnected = []
#     for connection in active_connections:
#         try:
#             await connection.send_json(message)
#         except:
#             disconnected.append(connection)
#     for conn in disconnected:
#         if conn in active_connections:
#             active_connections.remove(conn)

# @router.websocket("/ws/notifications")
# async def websocket_notifications(websocket: WebSocket):
#     await websocket.accept()
#     active_connections.append(websocket)
#     try:
#         while True:
#             await websocket.receive_text()
#     except WebSocketDisconnect:
#         if websocket in active_connections:
#             active_connections.remove(websocket)

# # Pydantic Schema

# class EventCreate(BaseModel):
#     title: str
#     description: Optional[str] = None
#     location: Optional[str] = None
#     start_date: datetime
#     end_date: Optional[datetime] = None
#     is_holiday: bool = False
#     type: str = "event"  # event | announcement

# # Create Event (STRICTLY ADMIN)

# @router.post("/")
# async def create_event(
#     event: EventCreate,
#     db: Session = Depends(get_db),
#     current_user = Depends(roles_required(["admin"])) 
# ):
#     new_event = Event(**event.dict())
#     db.add(new_event)
#     db.commit()
#     db.refresh(new_event)

#     await broadcast_notification({
#         "type": "new_event",
#         "title": new_event.title,
#         "event_type": new_event.type
#     })

#     if new_event.type == "announcement":
#         # Note: You'll want to update your email helper to pull real user emails from DB
#         pass 

#     return {"message": "Event created successfully", "event": new_event}

# # Get Events (ADMIN, AUDITOR, & STAFF)

# @router.get("/")
# def get_events(
#     db: Session = Depends(get_db),
#     # Explicitly allow Admin and Auditor to ensure they bypass any staff-only filters
#     current_user = Depends(roles_required(["admin", "read_only_admin", "staff", "employee"]))
# ):
#     """
#     Fetch all events. 
#     By listing all roles in roles_required, we ensure the Auditor 
#     is recognized as an authorized viewer.
#     """
#     events = db.query(Event).order_by(Event.start_date.asc()).all()
    
#     # Debugging print (Check your terminal if it still doesn't show)
#     print(f"DEBUG: User {current_user.email} with role {current_user.role.name} is fetching events.")
    
#     return events

# # Delete Event (STRICTLY ADMIN)

# @router.delete("/{event_id}")
# async def delete_event(
#     event_id: int,
#     db: Session = Depends(get_db),
#     # RESTRICTED: Auditor cannot delete events
#     current_user = Depends(roles_required(["admin"]))
# ):
#     event = db.query(Event).filter(Event.id == event_id).first()
#     if not event:
#         raise HTTPException(status_code=404, detail="Event not found")

#     db.delete(event)
#     db.commit()

#     await broadcast_notification({
#         "type": "deleted_event",
#         "event_id": event_id
#     })

#     return {"message": "Event deleted successfully"}