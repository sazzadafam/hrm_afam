from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy import Date, cast, extract, func
from sqlalchemy.orm import Session, joinedload
from datetime import date as dt_date, datetime, timedelta
from typing import List, Optional
from app.core.database import get_db
from app.core.auth import roles_required 
from app.models.attendance import Attendance, AttendanceLog
from app.models.employee import Employee
from app.models.user import User

router = APIRouter()



def calculate_hours(check_in: datetime, check_out: datetime) -> float:
    """Calculates decimal hours between two timestamps, handling midnight spans."""
    if not check_in or not check_out:
        return 0.0
    
    delta = check_out - check_in
    total_seconds = delta.total_seconds()
    
    if total_seconds < 0:
        return 0.0
        
    # Convert to decimal (e.g., 8h 30m -> 8.5)
    return round(total_seconds / 3600.0, 2)





@router.get("/stats")
def get_attendance_stats(
    db: Session = Depends(get_db), 
    current_user = Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    today = dt_date.today()
    total_employees = db.query(Employee).filter(Employee.is_active == True).count()
    
    present_now = db.query(Attendance).filter(
        cast(Attendance.check_in, Date) == today,
        Attendance.check_out == None,
        Attendance.status != "Absent"
    ).count()

    return {
        "present_now": present_now,
        "absent": max(0, total_employees - present_now),
        "total_employees": total_employees,
        "last_updated": datetime.now().isoformat()
    }


@router.get("/all")
@router.get("/summary")
def get_attendance_data(
    db: Session = Depends(get_db), 
    current_user = Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    logs = db.query(Attendance).options(
        joinedload(Attendance.employee_record).joinedload(Employee.user)
    ).order_by(Attendance.check_in.desc()).all()

    results = []
    for a in logs:
        emp = a.employee_record
        s_start = getattr(emp, 'shift_start', "16:00") or "16:00"
        s_end = getattr(emp, 'shift_end', "04:00") or "04:00"

        results.append({
            "id": a.id,
            "employee_id": a.employee_id,
            "name": emp.user.name if emp and emp.user else "Unknown",
            "department": emp.department if emp else "Main",
            "shift_start": s_start, 
            "shift_end": s_end,
            "check_in": a.check_in.isoformat() if a.check_in else None,
            "check_out": a.check_out.isoformat() if a.check_out else None,
            "hours_worked": a.hours_worked or 0.0,
            "shift_type": a.shift_type or ("Night" if a.check_in and a.check_in.hour >= 16 else "Day"),
            "status": a.status,
            "date": a.check_in.date().isoformat() if a.check_in else (a.date.isoformat() if hasattr(a, 'date') and a.date else None)
        })
    return results




@router.post("/sync-zk-log")
async def sync_zk_log(
    employee_id: str,
    timestamp: str,
    db: Session = Depends(get_db)
):
    """
    Optimized Attendance Sync (v4)
    - Fixes Midnight Lateness Bug (11:59 PM vs 00:00 AM)
    - Threshold for Final Out: 5h 40m (5.67h)
    - Handles breaks and automatic night shift detection
    """

    # --- 0. PARSE TIMESTAMP ---
    try:
        # Standardize timestamp to UTC-aware datetime
        ts_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    except ValueError:
        ts_dt = datetime.now()

    # --- 1. VERIFY EMPLOYEE ---
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not emp.is_active:
        raise HTTPException(status_code=400, detail="Employee inactive")

    # --- HELPER: FIXED MIDNIGHT LATE CHECK ---
    def is_late_check(ts, shift_start_time):
        if not shift_start_time:
            return False

        h, m = map(int, shift_start_time.split(':'))
        # Create a reference point on the same calendar day as the tap
        scheduled_ref = ts.replace(hour=h, minute=m, second=0, microsecond=0)

        # LOGIC: If shift is 00:00 and they tap at 23:5x, compare to NEXT day 00:00
        if h == 0 and ts.hour == 23:
            target_time = scheduled_ref + timedelta(days=1)
        # LOGIC: If shift is 22:00/23:00 and they tap at 00:0x, compare to PREVIOUS day
        elif h >= 22 and ts.hour <= 2:
            target_time = scheduled_ref - timedelta(days=1)
        else:
            target_time = scheduled_ref

        # True only if current time is > (Target + 10 minute grace)
        return ts > (target_time + timedelta(minutes=10))

    # --- 2. FIND ACTIVE SESSION (Lookback window 16h) ---
    active = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.check_in >= (ts_dt - timedelta(hours=16)),
        Attendance.status.in_(["ongoing", "on_break", "Absent"])
    ).order_by(Attendance.check_in.desc()).first()

    # --- 3. NEW CHECK-IN ---
    if not active:
        is_late = is_late_check(ts_dt, emp.shift_start)

        entry = Attendance(
            employee_id=employee_id,
            user_id=emp.user_id,
            check_in=ts_dt,
            status="ongoing",
            is_late=is_late,  # Now correctly saving to DB
            shift_type="Night" if (ts_dt.hour >= 16 or ts_dt.hour < 4) else "Day",
            week_number=ts_dt.isocalendar()[1]
        )

        db.add(entry)
        db.add(AttendanceLog(
            employee_id=employee_id,
            timestamp=ts_dt,
            type="IN",
            source="ZK_MACHINE"
        ))
        db.commit()

        return {"action": "check_in_recorded", "is_late": is_late}

    # --- 4. REPAIR ABSENT ---
    if active.status == "Absent":
        is_late = is_late_check(ts_dt, emp.shift_start)

        active.status = "ongoing"
        active.check_in = ts_dt
        active.is_late = is_late

        db.add(AttendanceLog(
            employee_id=employee_id,
            timestamp=ts_dt,
            type="IN_LATE_FIXED",
            source="ZK_MACHINE"
        ))
        db.commit()

        return {"action": "absent_repaired", "is_late": is_late}

    # --- 5. DOUBLE TAP PROTECTION (120s) ---
    last_log = db.query(AttendanceLog).filter(
        AttendanceLog.employee_id == employee_id
    ).order_by(AttendanceLog.timestamp.desc()).first()

    if last_log and (ts_dt - last_log.timestamp).total_seconds() < 120:
        return {"action": "ignored", "reason": "double_tap"}

    # --- 6. ELAPSED TIME CALCULATION ---
    elapsed_hours = (ts_dt - active.check_in).total_seconds() / 3600

    # --- 7. RETURN FROM BREAK ---
    if active.status == "on_break":
        active.status = "ongoing"

        if active.last_break_start:
            break_mins = (ts_dt - active.last_break_start).total_seconds() / 60
            active.total_break_minutes = (active.total_break_minutes or 0) + break_mins

        db.add(AttendanceLog(
            employee_id=employee_id,
            timestamp=ts_dt,
            type="BREAK_END",
            source="ZK_MACHINE"
        ))
        db.commit()

        return {"action": "back_to_work"}

    # --- 8. ONGOING → BREAK OR FINAL OUT ---
    if active.status == "ongoing":

        # CASE: FINAL CHECKOUT (Work duration > 5.67h)
        if elapsed_hours > 5.67:
            active.status = "completed"
            active.check_out = ts_dt

            # Subtract breaks from total time
            break_hours = (active.total_break_minutes or 0) / 60
            worked = max(0, elapsed_hours - break_hours)
            active.hours_worked = round(worked, 2)

            db.add(AttendanceLog(
                employee_id=employee_id,
                timestamp=ts_dt,
                type="OUT",
                source="ZK_MACHINE"
            ))
            db.commit()

            return {
                "action": "final_checkout_recorded",
                "hours_worked": active.hours_worked
            }

        # CASE: START BREAK (Short duration tap)
        active.status = "on_break"
        active.last_break_start = ts_dt

        db.add(AttendanceLog(
            employee_id=employee_id,
            timestamp=ts_dt,
            type="BREAK_START",
            source="ZK_MACHINE"
        ))
        db.commit()

        return {"action": "break_started"}

    return {"action": "no_change"}



# @router.post("/sync-zk-log")
# async def sync_zk_log(
#     employee_id: str, 
#     timestamp: str, 
#     db: Session = Depends(get_db)
# ):
#     """
#     Synchronizes logs from ZK Biometric machines.
#     - Threshold for Final Out: 5 Hours 40 Minutes (5.67 hours).
#     - Handles Midnight shift boundaries (11:50 PM - 12:10 AM grace).
#     - Bi-directional 10-minute grace period for lateness.
#     """
#     try:
#         # Standardize timestamp to UTC-aware datetime
#         ts_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
#     except ValueError:
#         ts_dt = datetime.now()

#     # --- 1. VERIFY EMPLOYEE ---
#     emp_record = db.query(Employee).filter(Employee.employee_id == employee_id).first()
#     if not emp_record:
#         raise HTTPException(status_code=404, detail="Employee not found")
    
#     if not emp_record.is_active:
#         raise HTTPException(status_code=400, detail="Employee is inactive")

#     # --- 2. FIND ACTIVE CONTEXT ---
#     active_session = db.query(Attendance).filter(
#         Attendance.employee_id == employee_id,
#         Attendance.check_in >= (ts_dt - timedelta(hours=16)),
#         Attendance.status.in_(["ongoing", "Absent", "on_break"])
#     ).order_by(Attendance.check_in.desc()).first()

#     # --- 3. CASE: NEW CHECK-IN ---
#     if not active_session:
#         is_late = False
#         if emp_record.shift_start:
#             h, m = map(int, emp_record.shift_start.split(':'))
#             scheduled = ts_dt.replace(hour=h, minute=m, second=0, microsecond=0)

#             # MIDNIGHT LOGIC
#             if h == 0 and ts_dt.hour == 23 and ts_dt.minute >= 50:
#                 scheduled += timedelta(days=1)
#             elif h >= 22 and ts_dt.hour <= 2:
#                 scheduled -= timedelta(days=1)

#             # GRACE PERIOD (10 mins)
#             if ts_dt > (scheduled + timedelta(minutes=10)):
#                 is_late = True

#         new_entry = Attendance(
#             employee_id=employee_id,
#             user_id=emp_record.user_id,
#             check_in=ts_dt,
#             status="ongoing",
#             # REMOVED is_late=is_late to prevent crash
#             shift_type="Night" if (ts_dt.hour >= 16 or ts_dt.hour < 4) else "Day",
#             week_number=ts_dt.isocalendar()[1]
#         )
#         db.add(new_entry)
#         db.add(AttendanceLog(
#             employee_id=employee_id, 
#             timestamp=ts_dt, 
#             type="IN", 
#             source="ZK_MACHINE"
#         ))
#         db.commit()
#         return {"action": "check_in_recorded", "is_late": is_late}

#     # --- 4. CASE: REPAIR ABSENT ---
#     if active_session.status == "Absent":
#         active_session.status = "ongoing"
#         active_session.check_in = ts_dt
        
#         is_late = False
#         if emp_record.shift_start:
#             h, m = map(int, emp_record.shift_start.split(':'))
#             scheduled = ts_dt.replace(hour=h, minute=m, second=0, microsecond=0)
#             if h == 0 and ts_dt.hour == 23 and ts_dt.minute >= 50: scheduled += timedelta(days=1)
#             elif h >= 22 and ts_dt.hour <= 2: scheduled -= timedelta(days=1)
#             if ts_dt > (scheduled + timedelta(minutes=10)): is_late = True
        
#         # REMOVED active_session.is_late = is_late to prevent crash
#         db.add(AttendanceLog(
#             employee_id=employee_id, 
#             timestamp=ts_dt, 
#             type="IN_LATE_FIXED", 
#             source="ZK_MACHINE"
#         ))
#         db.commit()
#         return {"action": "absent_repaired", "is_late": is_late}

#     # --- 5. SAFETY: DOUBLE TAP PREVENTION ---
#     last_log = db.query(AttendanceLog).filter(
#         AttendanceLog.employee_id == employee_id
#     ).order_by(AttendanceLog.timestamp.desc()).first()
    
#     if last_log and (ts_dt - last_log.timestamp).total_seconds() < 120:
#         return {"action": "ignored", "reason": "double_tap"}

#     # --- 6. ELAPSED TIME CALCULATION ---
#     elapsed_hours = (ts_dt - active_session.check_in).total_seconds() / 3600

#     # --- 7. CASE: RETURN FROM BREAK ---
#     if active_session.status == "on_break":
#         active_session.status = "ongoing"
#         if hasattr(active_session, 'last_break_start') and active_session.last_break_start:
#             break_mins = (ts_dt - active_session.last_break_start).total_seconds() / 60
#             current_total = getattr(active_session, 'total_break_minutes', 0) or 0
#             active_session.total_break_minutes = (current_total or 0) + break_mins
        
#         db.add(AttendanceLog(
#             employee_id=employee_id, 
#             timestamp=ts_dt, 
#             type="BREAK_END", 
#             source="ZK_MACHINE"
#         ))
#         db.commit()
#         return {"action": "back_to_work"}

#     # --- 8. CASE: START BREAK OR FINAL OUT ---
#     if active_session.status == "ongoing":
#         # THRESHOLD: 5 Hours 40 Minutes (5.67 Hours)
#         if elapsed_hours > 5.67:
#             active_session.status = "completed"
#             active_session.check_out = ts_dt
            
#             total_elapsed = (ts_dt - active_session.check_in).total_seconds() / 3600
#             break_hours = (getattr(active_session, 'total_break_minutes', 0) or 0) / 60
#             active_session.hours_worked = round(max(0, total_elapsed - break_hours), 2)
            
#             db.add(AttendanceLog(
#                 employee_id=employee_id, 
#                 timestamp=ts_dt, 
#                 type="OUT", 
#                 source="ZK_MACHINE"
#             ))
#             db.commit()
#             return {"action": "final_checkout_recorded", "hours": active_session.hours_worked}
        
#         else:
#             active_session.status = "on_break"
#             active_session.last_break_start = ts_dt
#             db.add(AttendanceLog(
#                 employee_id=employee_id, 
#                 timestamp=ts_dt, 
#                 type="BREAK_START", 
#                 source="ZK_MACHINE"
#             ))
#             db.commit()
#             return {"action": "break_started"}

#     return {"action": "unhandled_condition"}










# --- 4. MANUAL CORRECTIONS & CRUD ---

# --- 4. MANUAL CORRECTIONS & CRUD ---
@router.post("/manual")
@router.put("/attendance/{attendance_id}") # Add support for PUT requests
async def add_or_update_manual_attendance(
    attendance_id: str = None, # Handle the ID from the URL if it exists
    data: dict = Body(...), 
    db: Session = Depends(get_db), 
    current_user = Depends(roles_required(["admin", "auditor"]))
):
    # 1. Identify the Employee
    emp = db.query(Employee).filter(Employee.employee_id == data["employee_id"]).first()
    if not emp: 
        raise HTTPException(status_code=404, detail="Employee not found")

    # 2. Parse timestamps correctly (Handling 'Z' for UTC)
    try:
        def parse_dt(dt_str):
            if not dt_str: return None
            return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))

        check_in = parse_dt(data.get("check_in"))
        check_out = parse_dt(data.get("check_out"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

    # 3. UPSERT LOGIC (Update or Insert)
    # Check if a record already exists for this ID or for this employee on this day
    existing_rec = None
    if attendance_id and not attendance_id.startswith("temp-"):
        existing_rec = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    
    if not existing_rec and check_in:
        # Fallback: Look for an existing "Absent" record for today to overwrite
        today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        existing_rec = db.query(Attendance).filter(
            Attendance.employee_id == emp.employee_id,
            Attendance.check_in >= today_start,
            Attendance.check_in < today_end
        ).first()

    if existing_rec:
        # UPDATE existing (e.g., changing "Absent" to a real time)
        existing_rec.check_in = check_in or existing_rec.check_in
        existing_rec.check_out = check_out
        existing_rec.status = "completed" if check_out else "ongoing"
        # Recalculate hours if both exist
        if existing_rec.check_in and existing_rec.check_out:
            existing_rec.hours_worked = calculate_hours(existing_rec.check_in, existing_rec.check_out)
        
        db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", source="ADMIN"))
        msg = "Attendance record updated"
    else:
        # CREATE new record
        new_rec = Attendance(
            employee_id=emp.employee_id,
            user_id=emp.user_id,
            check_in=check_in,
            check_out=check_out,
            status="completed" if check_out else "ongoing",
            shift_type="Night" if check_in and (check_in.hour >= 16 or check_in.hour < 4) else "Day",
            week_number=check_in.isocalendar()[1] if check_in else datetime.now().isocalendar()[1]
        )
        if new_rec.check_in and new_rec.check_out:
            new_rec.hours_worked = calculate_hours(new_rec.check_in, new_rec.check_out)
        
        db.add(new_rec)
        db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", source="ADMIN"))
        msg = "New manual entry created"

    db.commit()
    return {"message": msg}





@router.put("/{attendance_id}")
async def update_attendance(
    attendance_id: str, # Change to str to support 'temp-xxx' IDs
    data: dict, 
    db: Session = Depends(get_db), 
    current_user = Depends(roles_required(["admin", "auditor"]))
):
    # 1. Handle Temporary IDs (temp-13, etc.)
    # If the ID is temporary, we can't find it by ID. 
    # We must find the record by employee_id and check_in date.
    record = None
    
    if attendance_id.startswith("temp-"):
        emp_id = data.get("employee_id")
        if not emp_id:
            raise HTTPException(status_code=400, detail="Employee ID required for new records")
            
        # Try to find an existing record for this employee today (e.g., an 'Absent' record)
        # Assuming your data["check_in"] is the reference date
        try:
            target_date = datetime.fromisoformat(data["check_in"].replace('Z', '+00:00')).date()
            record = db.query(Attendance).filter(
                Attendance.employee_id == emp_id,
                func.date(Attendance.check_in) == target_date
            ).first()
        except:
            pass
    else:
        # It's a real database ID
        record = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()

    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    # 2. Update Check-In
    if data.get("check_in"):
        try:
            # Use +00:00 instead of empty string to maintain timezone awareness
            record.check_in = datetime.fromisoformat(data["check_in"].replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid check_in format")

    # 3. Update Check-Out & Status
    check_out_val = data.get("check_out")
    if check_out_val and str(check_out_val).strip() not in ["", "null", "None"]:
        try:
            record.check_out = datetime.fromisoformat(str(check_out_val).replace('Z', '+00:00'))
            record.status = "completed"
        except ValueError:
            record.check_out = None
            record.status = "ongoing"
    else:
        record.check_out = None
        record.status = "ongoing"

    # 4. Recalculate Hours
    if record.check_in and record.check_out:
        record.hours_worked = calculate_hours(record.check_in, record.check_out)
    else:
        record.hours_worked = 0.0

    # 5. Log the Manual Edit
    db.add(AttendanceLog(
        employee_id=record.employee_id, 
        type="MANUAL_EDIT", 
        timestamp=datetime.now(),
        source="ADMIN_PANEL"
    ))

    db.commit()
    return {"message": "Updated successfully", "id": record.id}





@router.delete("/{attendance_id}")
async def delete_attendance(attendance_id: int, db: Session = Depends(get_db), current_user = Depends(roles_required(["admin"]))):
    record = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not record: raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted successfully"}


@router.post("/mark-absents")
def mark_absent_employees(db: Session = Depends(get_db)):
    today = dt_date.today()
    now = datetime.now()
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    
    absent_count = 0
    for emp in employees:
        shift_time_str = emp.shift_start or "07:00" # Default to 7am
        h, m = map(int, shift_time_str.split(':'))
        expected_start = datetime.combine(today, datetime.min.time()).replace(hour=h, minute=m)
        
        # If current time is 1 hour past their expected start
        if now > (expected_start + timedelta(hours=1)):
            # Check if any record exists (including 'ongoing' or 'completed')
            exists = db.query(Attendance).filter(
                Attendance.employee_id == emp.employee_id,
                # Use a wider check to avoid duplicate rows for the same day
                cast(Attendance.check_in, Date) == today
            ).first()
            
            if not exists:
                absent_entry = Attendance(
                    employee_id=emp.employee_id,
                    user_id=emp.user_id,
                    check_in=expected_start, # This is the "scheduled" time
                    status="Absent", # CRITICAL: This label allows the sync to overwrite it
                    hours_worked=0.0,
                    shift_type="Day" if h < 16 else "Night",
                    week_number=today.isocalendar()[1]
                )
                db.add(absent_entry)
                absent_count += 1
    
    db.commit()
    return {"message": f"Scan complete. {absent_count} employees marked absent."}




@router.get("/stats")
def get_attendance_stats(db: Session = Depends(get_db)):
    today = dt_date.today()
    # present_now should count anyone who has checked in today and not checked out
    present_now = db.query(Attendance).filter(
        cast(Attendance.check_in, Date) == today,
        Attendance.check_out == None,
        Attendance.status != "Absent"
    ).count()



