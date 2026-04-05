from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import Optional, List
from app.core.database import get_db
# Use roles_required for multi-role support
from app.core.auth import roles_required, get_current_user 
from app.models.event import Event
from pydantic import BaseModel
from datetime import datetime
import smtplib
from email.mime.text import MIMEText
import os

router = APIRouter()

# WebSocket Connection Manager

active_connections: List[WebSocket] = []

async def broadcast_notification(message: dict):
    disconnected = []
    for connection in active_connections:
        try:
            await connection.send_json(message)
        except:
            disconnected.append(connection)
    for conn in disconnected:
        if conn in active_connections:
            active_connections.remove(conn)

@router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)

# Pydantic Schema

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    start_date: datetime
    end_date: Optional[datetime] = None
    is_holiday: bool = False
    type: str = "event"  # event | announcement

# Create Event (STRICTLY ADMIN)

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

    await broadcast_notification({
        "type": "new_event",
        "title": new_event.title,
        "event_type": new_event.type
    })

    if new_event.type == "announcement":
        # Note: You'll want to update your email helper to pull real user emails from DB
        pass 

    return {"message": "Event created successfully", "event": new_event}

# Get Events (ADMIN, AUDITOR, & STAFF)

@router.get("/")
def get_events(
    db: Session = Depends(get_db),
    # Explicitly allow Admin and Auditor to ensure they bypass any staff-only filters
    current_user = Depends(roles_required(["admin", "read_only_admin", "staff", "employee"]))
):
    """
    Fetch all events. 
    By listing all roles in roles_required, we ensure the Auditor 
    is recognized as an authorized viewer.
    """
    events = db.query(Event).order_by(Event.start_date.asc()).all()
    
    # Debugging print (Check your terminal if it still doesn't show)
    print(f"DEBUG: User {current_user.email} with role {current_user.role.name} is fetching events.")
    
    return events

# Delete Event (STRICTLY ADMIN)

@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    # RESTRICTED: Auditor cannot delete events
    current_user = Depends(roles_required(["admin"]))
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()

    await broadcast_notification({
        "type": "deleted_event",
        "event_id": event_id
    })

    return {"message": "Event deleted successfully"}













# from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
# from sqlalchemy.orm import Session
# from typing import Optional, List
# from app.core.database import get_db
# from app.core.auth import role_required
# from app.models.event import Event
# from pydantic import BaseModel
# from datetime import datetime
# import smtplib
# from email.mime.text import MIMEText
# import os
# from app.core.auth import get_current_user

# router = APIRouter()

# # ===============================
# # WebSocket Connection Manager
# # ===============================

# active_connections: List[WebSocket] = []

# async def broadcast_notification(message: dict):
#     disconnected = []
#     for connection in active_connections:
#         try:
#             await connection.send_json(message)
#         except:
#             disconnected.append(connection)

#     for conn in disconnected:
#         active_connections.remove(conn)


# @router.websocket("/ws/notifications")
# async def websocket_notifications(websocket: WebSocket):
#     await websocket.accept()
#     active_connections.append(websocket)
#     try:
#         while True:
#             await websocket.receive_text()
#     except WebSocketDisconnect:
#         active_connections.remove(websocket)


# # ===============================
# # Pydantic Schema
# # ===============================

# class EventCreate(BaseModel):
#     title: str
#     description: Optional[str] = None
#     location: Optional[str] = None
#     start_date: datetime
#     end_date: Optional[datetime] = None
#     is_holiday: bool = False
#     type: str = "event"  # event | announcement


# # ===============================
# # Email Broadcast
# # ===============================

# def send_email_to_all_users(subject: str, body: str):
#     try:
#         sender = os.getenv("EMAIL_USER")
#         password = os.getenv("EMAIL_PASS")

#         # TODO: Replace with DB query for real users
#         recipients = ["employee1@gmail.com", "employee2@gmail.com"]

#         server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
#         server.login(sender, password)

#         for recipient in recipients:
#             msg = MIMEText(body)
#             msg["Subject"] = subject
#             msg["From"] = sender
#             msg["To"] = recipient
#             server.sendmail(sender, recipient, msg.as_string())

#         server.quit()

#     except Exception as e:
#         print("Email send failed:", e)


# # ===============================
# # Create Event (ADMIN ONLY)
# # ===============================

# @router.post("/")
# async def create_event(
#     event: EventCreate,
#     db: Session = Depends(get_db),
#     user=Depends(role_required("admin"))  # 🔐 ADMIN ONLY
# ):
#     new_event = Event(**event.dict())
#     db.add(new_event)
#     db.commit()
#     db.refresh(new_event)

#     # 🔔 Real-time notification
#     await broadcast_notification({
#         "type": "new_event",
#         "title": new_event.title,
#         "event_type": new_event.type
#     })

#     # 📧 Email only if announcement
#     if new_event.type == "announcement":
#         send_email_to_all_users(
#             subject=f"New Announcement: {new_event.title}",
#             body=new_event.description or "New company announcement posted."
#         )

#     return {
#         "message": "Event created successfully",
#         "event": new_event
#     }


# # ===============================
# # Get Events (EMPLOYEES CAN VIEW)
# # ===============================

# @router.get("/")
# def get_events(
#     db: Session = Depends(get_db),
#     user=Depends(get_current_user)
# ):
#     return db.query(Event).order_by(Event.start_date.asc()).all()


# # ===============================
# # Delete Event (ADMIN ONLY)
# # ===============================

# @router.delete("/{event_id}")
# async def delete_event(
#     event_id: int,
#     db: Session = Depends(get_db),
#     user=Depends(role_required("admin"))  # 🔐 ADMIN ONLY
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