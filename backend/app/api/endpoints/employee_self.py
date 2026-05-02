# import os
# import uuid
# import shutil
# from datetime import date
# from typing import Optional
# from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
# from sqlalchemy import func
# from sqlalchemy.orm import Session
# import asyncio
# import logging

# from app.models.leave import LeaveRequest
# from app.models.attendance import Attendance
# from app.models.employee import Employee
# from app.models.event import Event
# from app.models.user import User
# from app.core.database import get_db
# from app.api import deps

# logger = logging.getLogger(__name__)
# router = APIRouter()

# UPLOAD_DIR = "uploads/medical"
# os.makedirs(UPLOAD_DIR, exist_ok=True)


# # ---------------------------------------------------------------------------
# # WebSocket Notification Manager
# # ---------------------------------------------------------------------------

# class EmployeeNotificationManager:
#     def __init__(self):
#         self.connections: dict[int, list[WebSocket]] = {}
#         self._lock = asyncio.Lock()

#     async def connect(self, ws: WebSocket, user_id: int):
#         await ws.accept()
#         async with self._lock:
#             self.connections.setdefault(user_id, []).append(ws)

#     async def disconnect(self, ws: WebSocket, user_id: int):
#         async with self._lock:
#             conns = self.connections.get(user_id, [])
#             if ws in conns:
#                 conns.remove(ws)

#     async def send_to_user(self, user_id: int, message: dict):
#         """Push a notification to one specific employee."""
#         async with self._lock:
#             targets = list(self.connections.get(user_id, []))
#         dead = []
#         for ws in targets:
#             try:
#                 await ws.send_json(message)
#             except Exception:
#                 dead.append(ws)
#         if dead:
#             async with self._lock:
#                 for ws in dead:
#                     if ws in self.connections.get(user_id, []):
#                         self.connections[user_id].remove(ws)

#     async def broadcast_to_all(self, message: dict):
#         """Push a notification to every connected employee (e.g. new event)."""
#         dead: list[tuple[int, WebSocket]] = []
#         async with self._lock:
#             targets = [(uid, ws) for uid, conns in self.connections.items() for ws in conns]
#         for uid, ws in targets:
#             try:
#                 await ws.send_json(message)
#             except Exception:
#                 dead.append((uid, ws))
#         if dead:
#             async with self._lock:
#                 for uid, ws in dead:
#                     if ws in self.connections.get(uid, []):
#                         self.connections[uid].remove(ws)


# emp_notification_manager = EmployeeNotificationManager()


# # ---------------------------------------------------------------------------
# # WebSocket
# # ---------------------------------------------------------------------------

# @router.websocket("/ws/employee-notifications")
# async def employee_notifications_ws(websocket: WebSocket, db: Session = Depends(get_db)):
#     token = websocket.query_params.get("token")
#     if not token:
#         await websocket.close(code=1008)
#         return
#     try:
#         current_user = deps.get_user_from_token(token, db)
#     except Exception:
#         await websocket.close(code=1008)
#         return

#     await emp_notification_manager.connect(websocket, current_user.id)
#     try:
#         while True:
#             await websocket.receive_text()
#     except WebSocketDisconnect:
#         await emp_notification_manager.disconnect(websocket, current_user.id)
#     except Exception as e:
#         logger.warning(f"Employee WS error: {e}")
#         await emp_notification_manager.disconnect(websocket, current_user.id)


# # ---------------------------------------------------------------------------
# # GET /me
# # ---------------------------------------------------------------------------

# @router.get("/me")
# async def get_my_profile(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     emp   = db.query(Employee).filter(Employee.user_id == current_user.id).first()
#     today = date.today()

#     attendance_today = None
#     if emp:
#         attendance_today = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             func.date(Attendance.check_in) == today
#         ).first()

#     leave_rows = db.query(
#         LeaveRequest.leave_type,
#         func.count(LeaveRequest.id).label("count")
#     ).filter(
#         LeaveRequest.user_id == current_user.id,
#         LeaveRequest.status == "approved",
#         func.extract("year", LeaveRequest.start_date) == today.year
#     ).group_by(LeaveRequest.leave_type).all()

#     leave_counts = {r.leave_type: r.count for r in leave_rows}

#     return {
#         "id":          current_user.id,
#         "name":        current_user.name,
#         "full_name":   current_user.name,
#         "email":       current_user.email,
#         "role":        current_user.role.name if hasattr(current_user.role, "name") else str(current_user.role),
#         "created_at":  current_user.created_at.isoformat() if getattr(current_user, "created_at", None) else None,
#         "employee_id": emp.employee_id  if emp else None,
#         "department":  emp.department   if emp else None,
#         "shift_start": emp.shift_start  if emp else None,
#         "shift_end":   emp.shift_end    if emp else None,
#         "duty_hour":   emp.duty_hour    if emp else None,
#         "designation": getattr(emp, "designation", None) if emp else None,
#         "today_status": {
#             "is_on_duty": bool(attendance_today and not attendance_today.check_out),
#             "check_in":   attendance_today.check_in.isoformat()  if attendance_today and attendance_today.check_in  else None,
#             "check_out":  attendance_today.check_out.isoformat() if attendance_today and attendance_today.check_out else None,
#             "status":     attendance_today.status if attendance_today else "absent",
#         },
#         "leave_usage": {
#             "casual":                   leave_counts.get("Casual", 0),
#             "sick":                     leave_counts.get("Sick", 0),
#             "medical":                  leave_counts.get("Medical", 0),
#             "total_approved_this_year": sum(leave_counts.values()),
#         },
#     }


# # ---------------------------------------------------------------------------
# # GET /attendance
# # ---------------------------------------------------------------------------

# @router.get("/attendance")
# async def get_my_attendance(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     emp = db.query(Employee).filter(Employee.user_id == current_user.id).first()
#     if not emp:
#         return []
#     records = (
#         db.query(Attendance)
#         .filter(Attendance.employee_id == emp.employee_id)
#         .order_by(Attendance.check_in.desc())
#         .all()
#     )
#     return [
#         {
#             "id":           a.id,
#             "employee_id":  a.employee_id,
#             "check_in":     a.check_in.isoformat()  if a.check_in  else None,
#             "check_out":    a.check_out.isoformat() if a.check_out else None,
#             "hours_worked": a.hours_worked or 0.0,
#             "status":       a.status,
#             "shift_start":  a.shift_start or emp.shift_start,
#             "shift_end":    a.shift_end   or emp.shift_end,
#             "duty_hour":    a.duty_hour   or emp.duty_hour,
#             "shift_type":   a.shift_type,
#             "date":         a.check_in.date().isoformat() if a.check_in else (
#                             a.date.isoformat() if getattr(a, "date", None) else None),
#         }
#         for a in records
#     ]


# # ---------------------------------------------------------------------------
# # POST /leave/request
# # ---------------------------------------------------------------------------

# @router.post("/leave/request")
# async def create_leave(
#     leave_type:     str                   = Form(...),
#     start_date:     date                  = Form(...),
#     end_date:       date                  = Form(...),
#     reason:         str                   = Form(None),
#     medical_report: Optional[UploadFile]  = File(None),
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     if end_date < start_date:
#         raise HTTPException(status_code=400, detail="End date cannot be before start date.")
#     if leave_type.lower() == "medical" and not medical_report:
#         raise HTTPException(status_code=400, detail="Medical report is required for medical leave.")

#     file_path = None
#     if medical_report:
#         ext = medical_report.filename.rsplit(".", 1)[-1].lower()
#         if ext not in {"pdf", "jpg", "jpeg", "png"}:
#             raise HTTPException(status_code=400, detail="Only PDF, JPG, JPEG, PNG files are accepted.")
#         filename  = f"{uuid.uuid4()}.{ext}"
#         file_path = os.path.join(UPLOAD_DIR, filename)
#         try:
#             with open(file_path, "wb") as buf:
#                 shutil.copyfileobj(medical_report.file, buf)
#         except Exception:
#             raise HTTPException(status_code=500, detail="Could not save uploaded file.")

#     new_leave = LeaveRequest(
#         user_id            = current_user.id,
#         leave_type         = leave_type,
#         start_date         = start_date,
#         end_date           = end_date,
#         reason             = reason,
#         medical_report_url = file_path,
#         status             = "pending",
#     )
#     db.add(new_leave)
#     db.commit()
#     db.refresh(new_leave)
#     return {"message": "Leave request submitted successfully.", "id": new_leave.id}


# # ---------------------------------------------------------------------------
# # GET /leave/history
# # ---------------------------------------------------------------------------

# @router.get("/leave/history")
# async def get_my_leave_history(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     records = (
#         db.query(LeaveRequest)
#         .filter(LeaveRequest.user_id == current_user.id)
#         .order_by(LeaveRequest.created_at.desc())
#         .all()
#     )
#     return [
#         {
#             "id":              r.id,
#             "leave_type":      r.leave_type,
#             "start_date":      r.start_date.isoformat() if r.start_date else None,
#             "end_date":        r.end_date.isoformat()   if r.end_date   else None,
#             "reason":          r.reason,
#             "status":          r.status,
#             "manager_remarks": getattr(r, "manager_remarks", None),
#             "created_at":      r.created_at.isoformat() if r.created_at else None,
#         }
#         for r in records
#     ]


# # ---------------------------------------------------------------------------
# # GET /events
# # ---------------------------------------------------------------------------

# @router.get("/events")
# async def get_employee_events(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     events = db.query(Event).order_by(Event.start_date.asc()).all()
#     return [
#         {
#             "id":          e.id,
#             "title":       e.title,
#             "description": e.description,
#             "location":    e.location,
#             "start_date":  e.start_date.isoformat() if e.start_date else None,
#             "end_date":    e.end_date.isoformat()   if e.end_date   else None,
#             "is_holiday":  e.is_holiday,
#             "type":        e.type,
#         }
#         for e in events
#     ]









# import os
# import uuid
# import shutil
# from datetime import date
# from typing import Optional, List
# from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
# from sqlalchemy import func
# from sqlalchemy.orm import Session, joinedload
# import asyncio
# import logging

# from app.models.leave import LeaveRequest
# from app.models.attendance import Attendance
# from app.models.employee import Employee
# from app.models.event import Event
# from app.models.user import User
# from app.core.database import get_db
# from app.api import deps

# logger = logging.getLogger(__name__)
# router = APIRouter()

# # ---------------------------------------------------------------------------
# # File upload config
# # ---------------------------------------------------------------------------

# UPLOAD_DIR = "uploads/medical"
# os.makedirs(UPLOAD_DIR, exist_ok=True)


# # ---------------------------------------------------------------------------
# # WebSocket notification manager (shared with events router if needed)
# # ---------------------------------------------------------------------------

# class EmployeeNotificationManager:
#     """Manages per-employee WebSocket connections for push notifications."""

#     def __init__(self):
#         # Map of user_id → list of active WebSocket connections
#         self.connections: dict[int, list[WebSocket]] = {}
#         self._lock = asyncio.Lock()

#     async def connect(self, ws: WebSocket, user_id: int):
#         await ws.accept()
#         async with self._lock:
#             self.connections.setdefault(user_id, []).append(ws)

#     async def disconnect(self, ws: WebSocket, user_id: int):
#         async with self._lock:
#             conns = self.connections.get(user_id, [])
#             if ws in conns:
#                 conns.remove(ws)

#     async def broadcast_to_all(self, message: dict):
#         """Send a notification to every connected employee."""
#         dead: list[tuple[int, WebSocket]] = []
#         async with self._lock:
#             targets = [(uid, ws) for uid, conns in self.connections.items() for ws in conns]
#         for uid, ws in targets:
#             try:
#                 await ws.send_json(message)
#             except Exception:
#                 dead.append((uid, ws))
#         if dead:
#             async with self._lock:
#                 for uid, ws in dead:
#                     if ws in self.connections.get(uid, []):
#                         self.connections[uid].remove(ws)


# emp_notification_manager = EmployeeNotificationManager()


# @router.websocket("/ws/employee-notifications")
# async def employee_notifications_ws(
#     websocket: WebSocket,
#     db: Session = Depends(get_db),
# ):
#     """
#     Each employee connects here after login.
#     Pass token as query param: /employee/ws/employee-notifications?token=<JWT>
#     """
#     token = websocket.query_params.get("token")
#     if not token:
#         await websocket.close(code=1008)
#         return

#     try:
#         current_user = deps.get_user_from_token(token, db)
#     except Exception:
#         await websocket.close(code=1008)
#         return

#     await emp_notification_manager.connect(websocket, current_user.id)
#     try:
#         while True:
#             await websocket.receive_text()   # Keep alive; client pings
#     except WebSocketDisconnect:
#         await emp_notification_manager.disconnect(websocket, current_user.id)
#     except Exception as e:
#         logger.warning(f"Employee WS error: {e}")
#         await emp_notification_manager.disconnect(websocket, current_user.id)


# # ---------------------------------------------------------------------------
# # GET /me  — returns merged User + Employee profile
# # ---------------------------------------------------------------------------

# @router.get("/me")
# async def get_my_profile(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     """
#     Returns full profile: User + Employee fields + Today's Status + Leave Summary.
#     """
#     # 1. Fetch Employee Details
#     emp = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    
#     # 2. Fetch Today's Attendance Status (Real-time from ZKTeco/ADMS logs)
#     today = date.today()
#     attendance_today = None
#     if emp:
#         attendance_today = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             func.date(Attendance.check_in) == today
#         ).first()

#     # 3. Fetch Leave Summary (Count of approved leaves this year)
#     current_year = today.year
#     leave_summary = db.query(
#         LeaveRequest.leave_type, 
#         func.count(LeaveRequest.id).label("count")
#     ).filter(
#         LeaveRequest.user_id == current_user.id,
#         LeaveRequest.status == "approved",
#         func.extract('year', LeaveRequest.start_date) == current_year
#     ).group_by(LeaveRequest.leave_type).all()

#     leave_counts = {l.leave_type: l.count for l in leave_summary}

#     return {
#         # User fields
#         "id":           current_user.id,
#         "name":         current_user.name,
#         "full_name":    current_user.name,
#         "email":        current_user.email,
#         "role":         current_user.role.name if hasattr(current_user.role, "name") else str(current_user.role),
#         "created_at":   current_user.created_at.isoformat() if getattr(current_user, "created_at", None) else None,

#         # Employee fields
#         "employee_id":  emp.employee_id if emp else None,
#         "department":   emp.department if emp else None,
#         "shift_start":  emp.shift_start if emp else None,
#         "shift_end":    emp.shift_end if emp else None,
#         "duty_hour":    emp.duty_hour if emp else None,
#         "designation":  getattr(emp, "designation", None) if emp else None,

#         # Real-time Dashboard Data
#         "today_status": {
#             "is_on_duty": bool(attendance_today and not attendance_today.check_out),
#             "check_in": attendance_today.check_in.isoformat() if attendance_today and attendance_today.check_in else None,
#             "check_out": attendance_today.check_out.isoformat() if attendance_today and attendance_today.check_out else None,
#             "status": attendance_today.status if attendance_today else "absent"
#         },
        
#         # Leave Quota/Usage Summary
#         "leave_usage": {
#             "casual": leave_counts.get("Casual", 0),
#             "sick": leave_counts.get("Sick", 0),
#             "medical": leave_counts.get("Medical", 0),
#             "total_approved_this_year": sum(leave_counts.values())
#         }
#     }
    


# # ---------------------------------------------------------------------------
# # GET /attendance  — employee sees ONLY their own records
# # ---------------------------------------------------------------------------

# @router.get("/attendance")
# async def get_my_attendance(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     """
#     Returns attendance records for the logged-in employee only.
#     Joins through Employee to find the correct employee_id.
#     """
#     emp = db.query(Employee).filter(Employee.user_id == current_user.id).first()
#     if not emp:
#         return []

#     records = (
#         db.query(Attendance)
#         .filter(Attendance.employee_id == emp.employee_id)
#         .order_by(Attendance.check_in.desc())
#         .all()
#     )

#     return [
#         {
#             "id":           a.id,
#             "employee_id":  a.employee_id,
#             "check_in":     a.check_in.isoformat()  if a.check_in  else None,
#             "check_out":    a.check_out.isoformat()  if a.check_out else None,
#             "hours_worked": a.hours_worked or 0.0,
#             "status":       a.status,
#             "shift_start":  a.shift_start or emp.shift_start,
#             "shift_end":    a.shift_end   or emp.shift_end,
#             "duty_hour":    a.duty_hour   or emp.duty_hour,
#             "shift_type":   a.shift_type,
#             "date":         a.check_in.date().isoformat() if a.check_in else (
#                             a.date.isoformat() if getattr(a, "date", None) else None),
#         }
#         for a in records
#     ]


# # ---------------------------------------------------------------------------
# # POST /leave/request  — submit a leave request
# # ---------------------------------------------------------------------------

# @router.post("/leave/request")
# async def create_leave(
#     leave_type:     str            = Form(...),
#     start_date:     date           = Form(...),
#     end_date:       date           = Form(...),
#     reason:         str            = Form(None),
#     medical_report: Optional[UploadFile] = File(None),
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     # Validation
#     if end_date < start_date:
#         raise HTTPException(status_code=400, detail="End date cannot be before start date.")
#     if leave_type.lower() == "medical" and not medical_report:
#         raise HTTPException(status_code=400, detail="Medical report is required for medical leave.")

#     # File upload
#     file_path = None
#     if medical_report:
#         ext      = medical_report.filename.rsplit(".", 1)[-1].lower()
#         if ext not in {"pdf", "jpg", "jpeg", "png"}:
#             raise HTTPException(status_code=400, detail="Only PDF, JPG, JPEG, PNG files are accepted.")
#         filename = f"{uuid.uuid4()}.{ext}"
#         file_path = os.path.join(UPLOAD_DIR, filename)
#         try:
#             with open(file_path, "wb") as buf:
#                 shutil.copyfileobj(medical_report.file, buf)
#         except Exception:
#             raise HTTPException(status_code=500, detail="Could not save uploaded file.")

#     new_leave = LeaveRequest(
#         user_id             = current_user.id,
#         leave_type          = leave_type,
#         start_date          = start_date,
#         end_date            = end_date,
#         reason              = reason,
#         medical_report_url  = file_path,
#         status              = "pending",
#     )
#     db.add(new_leave)
#     db.commit()
#     db.refresh(new_leave)

#     return {"message": "Leave request submitted successfully.", "id": new_leave.id}


# # ---------------------------------------------------------------------------
# # GET /leave/history  — employee's own leave request history
# # ---------------------------------------------------------------------------

# @router.get("/leave/history")
# async def get_my_leave_history(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     records = (
#         db.query(LeaveRequest)
#         .filter(LeaveRequest.user_id == current_user.id)
#         .order_by(LeaveRequest.created_at.desc())
#         .all()
#     )
#     return [
#         {
#             "id":         r.id,
#             "leave_type": r.leave_type,
#             "start_date": r.start_date.isoformat() if r.start_date else None,
#             "end_date":   r.end_date.isoformat()   if r.end_date   else None,
#             "reason":     r.reason,
#             "status":     r.status,
#             "created_at": r.created_at.isoformat() if r.created_at else None,
#         }
#         for r in records
#     ]


# # ---------------------------------------------------------------------------
# # GET /events  — upcoming & ongoing events for the employee portal
# # ---------------------------------------------------------------------------

# @router.get("/events")
# async def get_employee_events(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_user),
# ):
#     from datetime import datetime
#     now = datetime.utcnow()
#     events = (
#         db.query(Event)
#         .order_by(Event.start_date.asc())
#         .all()
#     )
#     return [
#         {
#             "id":          e.id,
#             "title":       e.title,
#             "description": e.description,
#             "location":    e.location,
#             "start_date":  e.start_date.isoformat() if e.start_date else None,
#             "end_date":    e.end_date.isoformat()   if e.end_date   else None,
#             "is_holiday":  e.is_holiday,
#             "type":        e.type,
#         }
#         for e in events
#     ]
