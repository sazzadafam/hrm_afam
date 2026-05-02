from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.core.database import get_db
from app.core.auth import roles_required
from app.models.attendance import Attendance, AttendanceLog
from app.models.employee import Employee

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def calculate_hours(check_in: datetime, check_out: datetime) -> float:
    """Decimal hours between two timestamps. Always >= 0."""
    if not check_in or not check_out:
        return 0.0
    total_seconds = (check_out - check_in).total_seconds()
    return max(0.0, round(total_seconds / 3600.0, 2))


def safe_hours(check_in: datetime, check_out: datetime, break_minutes: float = 0.0) -> float:
    return max(0.0, round(calculate_hours(check_in, check_out) - break_minutes / 60.0, 2))


def parse_iso(dt_str: str) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def strip_tz(dt: Optional[datetime]) -> Optional[datetime]:
    """Remove timezone info for naive-datetime DB columns."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def fix_cross_midnight_checkout(
    check_in: Optional[datetime],
    check_out: Optional[datetime]
) -> Optional[datetime]:
    """If check_out < check_in (overnight shift), add 1 day. 24h sanity guard."""
    if check_in is None or check_out is None:
        return check_out
    if check_out < check_in:
        adjusted = check_out + timedelta(days=1)
        if (adjusted - check_in).total_seconds() <= 86400:
            return adjusted
    return check_out


def determine_shift_type(
    shift_start_str: str,
    actual_check_in: Optional[datetime] = None
) -> str:
    """
    Day  : 02:00–14:00 inclusive
    Night: 00:00–01:59 or 14:01–23:59
    Priority: actual_check_in hour > shift_start_str > 'Unknown'
    """
    if actual_check_in is not None:
        total_mins = actual_check_in.hour * 60 + actual_check_in.minute
        return "Day" if 120 <= total_mins <= 840 else "Night"
    if not shift_start_str or not shift_start_str.strip():
        return "Unknown"
    try:
        parts = shift_start_str.strip().split(":")
        if len(parts) < 2:
            return "Unknown"
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            return "Unknown"
        total_mins = h * 60 + m
        return "Day" if 120 <= total_mins <= 840 else "Night"
    except (ValueError, IndexError):
        return "Unknown"


# ---------------------------------------------------------------------------
# PROBLEM 1 FIX: get_shift_start_dt
#
# BUG: In both sync-zk-log and auto-close-stale, the auto-close deadline was
# calculated as:
#   shift_start_dt = check_in.replace(hour=s_h, minute=s_m)
#   deadline = shift_start_dt + timedelta(hours=16/20)
#
# This uses the check_in's calendar DATE but the shift_start TIME.
# This is correct for most cases but WRONG when:
#   - Employee checks in BEFORE their shift (e.g. shift 08:00, check_in 07:45)
#     → shift_start_dt = same day 08:00 ✅
#   - Overnight shift: shift_start 22:00, check_in 23:50 (same day)
#     → shift_start_dt = same day 22:00 ✅
#   - BUT: shift_start 00:00, check_in 00:05
#     → shift_start_dt = same day 00:00 ✅
#   - BUT: shift_start 22:00, check_in 00:05 (next calendar day, night shift)
#     → check_in.replace(22:00) = 00:05's date at 22:00 = FUTURE by ~22h ❌
#     → deadline = that future 22:00 + 16h = 38h from now — never closes!
#
# The existing guard `if check_in.hour >= 22 and s_h < 4` only covers one edge.
#
# FIX: Compute shift_start_dt as the most recent occurrence of shift_start_time
# that is <= check_in. If placing shift_start_time on check_in's date gives a
# time > check_in, subtract one day.
# ---------------------------------------------------------------------------

def get_shift_start_dt(check_in: datetime, shift_start_str: str) -> datetime:
    """
    Returns the datetime of the shift_start that corresponds to the given check_in.
    Rule: the shift_start on the same calendar day as check_in, BUT if that
    would be AFTER check_in, use the previous calendar day's shift_start instead.
    This ensures deadline = shift_start_dt + N_hours is always a future time
    relative to check_in (or at most a few minutes past).
    """
    try:
        s_h, s_m = map(int, (shift_start_str or "08:00").split(":"))
    except ValueError:
        s_h, s_m = 8, 0

    # Place shift_start on check_in's date
    candidate = check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)

    # If candidate is more than 4 hours AFTER check_in, the employee likely
    # checked in before their shift (or it's a cross-midnight scenario where
    # the actual shift_start was yesterday). Step back one day.
    if (candidate - check_in).total_seconds() > 4 * 3600:
        candidate -= timedelta(days=1)

    return candidate


# ---------------------------------------------------------------------------
# GET /stats
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_attendance_stats(
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    total_employees = db.query(Employee).filter(Employee.is_active == True).count()

    now_naive   = datetime.now()
    time_limit  = now_naive - timedelta(hours=24)
    today_start = now_naive.replace(hour=0, minute=0, second=0, microsecond=0)

    present_now = db.query(Attendance).filter(
        Attendance.status.in_(["ongoing", "on_break"]),
        Attendance.check_in >= time_limit
    ).count()

    absent_count = db.query(Attendance).filter(
        Attendance.status == "Absent",
        Attendance.check_in >= today_start
    ).count()

    return {
        "present_now":     present_now,
        "absent":          absent_count,
        "total_employees": total_employees,
        "last_updated":    now_naive.isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /all  and  GET /summary
# ---------------------------------------------------------------------------

def _attendance_list(db: Session):
    logs = (
        db.query(Attendance)
        .options(joinedload(Attendance.employee_record).joinedload(Employee.user))
        .order_by(Attendance.check_in.desc())
        .all()
    )
    results = []
    for a in logs:
        emp     = a.employee_record
        s_start = getattr(a, "shift_start", None) or (getattr(emp, "shift_start", "08:00") if emp else "08:00")
        s_end   = getattr(a, "shift_end",   None) or (getattr(emp, "shift_end",   "20:00") if emp else "20:00")
        d_hour  = getattr(a, "duty_hour",   None) or (getattr(emp, "duty_hour",   12.0)    if emp else 12.0)

        resolved_shift_type = determine_shift_type(s_start, actual_check_in=a.check_in)

        hours_worked = a.hours_worked or 0.0
        if (
            a.status == "completed"
            and a.check_in
            and a.check_out
            and hours_worked == 0.0
        ):
            fixed_co   = fix_cross_midnight_checkout(a.check_in, a.check_out)
            recomputed = safe_hours(a.check_in, fixed_co, a.total_break_minutes or 0)
            if recomputed > 0:
                hours_worked = recomputed

        results.append({
            "id":           a.id,
            "employee_id":  a.employee_id,
            "name":         emp.user.name if emp and emp.user else "Unknown",
            "department":   emp.department if emp else "Main",
            "shift_start":  s_start,
            "shift_end":    s_end,
            "duty_hour":    d_hour,
            "check_in":     a.check_in.isoformat()  if a.check_in  else None,
            "check_out":    a.check_out.isoformat() if a.check_out else None,
            "hours_worked": hours_worked,
            "shift_type":   resolved_shift_type,
            "status":       a.status,
            "date":         (a.check_in.date().isoformat() if a.check_in
                             else (a.date.isoformat() if getattr(a, "date", None) else None)),
        })
    return results


@router.get("/all")
def get_attendance_all(
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    return _attendance_list(db)


@router.get("/summary")
def get_attendance_summary(
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    return _attendance_list(db)


# ---------------------------------------------------------------------------
# POST /sync-zk-log
# ---------------------------------------------------------------------------

@router.post("/sync-zk-log")
async def sync_zk_log(
    employee_id: str,
    timestamp: str,
    db: Session = Depends(get_db)
):
    ts_dt = strip_tz(parse_iso(timestamp)) or datetime.now()

    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp or not emp.is_active:
        raise HTTPException(status_code=404, detail="Employee not found")

    is_split_worker = emp.has_split_shift

    # Double-tap protection
    last_log = (
        db.query(AttendanceLog)
        .filter(AttendanceLog.employee_id == employee_id)
        .order_by(AttendanceLog.timestamp.desc())
        .first()
    )
    if last_log and (ts_dt - last_log.timestamp).total_seconds() < 3600:
        return {"action": "ignored", "reason": "double_tap"}

    # Find latest shift
    latest_shift = (
        db.query(Attendance)
        .filter(Attendance.employee_id == employee_id)
        .order_by(Attendance.check_in.desc())
        .first()
    )

    active = None
    if latest_shift:
        if latest_shift.check_in:
            # PROBLEM 1 FIX: use get_shift_start_dt for correct deadline base
            shift_start_dt  = get_shift_start_dt(latest_shift.check_in, latest_shift.shift_start or emp.shift_start or "08:00")
            penalty_hours   = 20 if is_split_worker else 16
            cutoff_deadline = shift_start_dt + timedelta(hours=penalty_hours)

            if ts_dt >= cutoff_deadline:
                if latest_shift.status in ["ongoing", "on_break"]:
                    latest_shift.status       = "completed"
                    latest_shift.hours_worked = 0.0
                    db.add(AttendanceLog(
                        employee_id=employee_id,
                        type="SYSTEM_AUTO_CLOSE",
                        timestamp=ts_dt,
                        source="ZK_MACHINE_OVERRIDE"
                    ))
                    db.commit()
                active = None
            else:
                active = latest_shift
        else:
            active = latest_shift

    punch_type = "IN" if not active or active.status == "Absent" else "OUT"
    db.add(AttendanceLog(
        employee_id=employee_id,
        timestamp=ts_dt,
        type=punch_type,
        source="ZK_MACHINE",
    ))

    # PUNCH 1: Duty Start
    if not active or active.status == "Absent":
        if active and active.status == "Absent":
            active.check_in    = ts_dt
            active.status      = "ongoing"
            active.shift_start = emp.shift_start
            active.shift_end   = emp.shift_end
            active.duty_hour   = emp.duty_hour
            active.shift_type  = determine_shift_type(emp.shift_start, actual_check_in=ts_dt)
            db.commit()
            return {"action": "absent_overwritten", "punch": 1}
        else:
            db.add(Attendance(
                employee_id=employee_id,
                user_id=emp.user_id,
                check_in=ts_dt,
                status="ongoing",
                week_number=ts_dt.isocalendar()[1],
                shift_start=emp.shift_start,
                shift_end=emp.shift_end,
                duty_hour=emp.duty_hour,
                shift_type=determine_shift_type(emp.shift_start, actual_check_in=ts_dt)
            ))
            db.commit()
            return {"action": "check_in_recorded", "punch": 1}

    # NORMAL WORKER LOGIC
    if not is_split_worker:
        fixed_out = fix_cross_midnight_checkout(active.check_in, ts_dt)
        active.status       = "completed"
        active.check_out    = ts_dt
        active.hours_worked = max(0.0, round(
            (fixed_out - active.check_in).total_seconds() / 3600.0, 2
        ))
        db.commit()
        return {"action": "checkout_updated", "hours": active.hours_worked}

    # SPLIT WORKER LOGIC (4-Punch Cycle)
    if active.status == "ongoing":
        if not active.last_break_start:
            active.status           = "on_break"
            active.last_break_start = ts_dt
            db.commit()
            return {"action": "break_started", "punch": 2}
        else:
            fixed_out = fix_cross_midnight_checkout(active.check_in, ts_dt)
            active.status       = "completed"
            active.check_out    = ts_dt
            active.hours_worked = safe_hours(active.check_in, fixed_out, active.total_break_minutes or 0)
            db.commit()
            return {"action": "checkout_completed", "hours": active.hours_worked, "punch": 4}

    elif active.status == "on_break":
        active.status = "ongoing"
        raw_break_mins      = (ts_dt - active.last_break_start).total_seconds() / 60
        billable_break_mins = max(0.0, raw_break_mins - 30.0)
        active.total_break_minutes = (active.total_break_minutes or 0) + billable_break_mins
        db.commit()
        return {"action": "returned_from_break", "punch": 3}

    elif active.status == "completed":
        fixed_out = fix_cross_midnight_checkout(active.check_in, ts_dt)
        active.check_out    = ts_dt
        active.hours_worked = safe_hours(active.check_in, fixed_out, active.total_break_minutes or 0)
        db.commit()
        return {"action": "checkout_extended", "hours": active.hours_worked}

    return {"action": "no_change"}


# ---------------------------------------------------------------------------
# POST /manual
# ---------------------------------------------------------------------------

@router.post("/manual")
async def add_manual_attendance(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "auditor"]))
):
    emp = db.query(Employee).filter(Employee.employee_id == data.get("employee_id", "")).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    try:
        check_in  = strip_tz(parse_iso(data.get("check_in")))
        check_out = strip_tz(parse_iso(data.get("check_out")))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

    if not check_in:
        raise HTTPException(status_code=400, detail="check_in is required.")

    check_out = fix_cross_midnight_checkout(check_in, check_out)

    try:
        s_h, s_m = map(int, (emp.shift_start or "08:00").split(":"))
        e_h, e_m = map(int, (emp.shift_end   or "20:00").split(":"))
    except ValueError:
        s_h, s_m, e_h, e_m = 8, 0, 20, 0

    shift_start_dt = check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)
    is_late        = check_in > (shift_start_dt + timedelta(minutes=15))

    attendance_label = "Normal"
    if check_out:
        shift_end_dt = check_in.replace(hour=e_h, minute=e_m, second=0, microsecond=0)
        if e_h < s_h:
            shift_end_dt += timedelta(days=1)
        if (shift_end_dt - check_out).total_seconds() / 60 > 10:
            attendance_label = "Early Leave"

    today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end   = today_start + timedelta(days=1)
    if check_in.hour >= 22 and s_h == 0:
        today_start -= timedelta(days=1)
        today_end   -= timedelta(days=1)

    existing = db.query(Attendance).filter(
        Attendance.employee_id == emp.employee_id,
        Attendance.check_in   >= today_start,
        Attendance.check_in   <  today_end,
    ).first()

    now = datetime.now()
    if existing:
        existing.check_in     = check_in
        existing.check_out    = check_out
        existing.status       = "completed" if check_out else "ongoing"
        existing.shift_type   = determine_shift_type(emp.shift_start, actual_check_in=check_in)
        if existing.check_in and existing.check_out:
            existing.hours_worked = safe_hours(
                existing.check_in, existing.check_out, existing.total_break_minutes or 0
            )
        db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", timestamp=now, source="ADMIN"))
        msg = "Attendance record updated"
    else:
        db.add(Attendance(
            employee_id=emp.employee_id,
            user_id=emp.user_id,
            check_in=check_in,
            check_out=check_out,
            status="completed" if check_out else "ongoing",
            hours_worked=safe_hours(check_in, check_out) if check_out else None,
            shift_type=determine_shift_type(emp.shift_start, actual_check_in=check_in),
            week_number=check_in.isocalendar()[1],
            shift_start=emp.shift_start,
            shift_end=emp.shift_end,
            duty_hour=emp.duty_hour,
        ))
        db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", timestamp=now, source="ADMIN"))
        msg = "New manual entry created"

    db.commit()
    return {"message": msg, "label_calculated": attendance_label, "is_late": is_late}


# ---------------------------------------------------------------------------
# PUT /attendance/{attendance_id}
# ---------------------------------------------------------------------------

@router.put("/attendance/{attendance_id}")
async def update_attendance_by_id(
    attendance_id: str,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "auditor"]))
):
    emp = db.query(Employee).filter(Employee.employee_id == data.get("employee_id", "")).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    check_in  = strip_tz(parse_iso(data.get("check_in")))
    check_out = strip_tz(parse_iso(data.get("check_out")))
    check_out = fix_cross_midnight_checkout(check_in, check_out)

    existing = None
    if not attendance_id.startswith("temp-"):
        try:
            existing = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid attendance ID")

    if not existing and check_in:
        today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end   = today_start + timedelta(days=1)
        existing    = db.query(Attendance).filter(
            Attendance.employee_id == emp.employee_id,
            Attendance.check_in   >= today_start,
            Attendance.check_in   <  today_end,
        ).first()

    effective_check_in = check_in or (existing.check_in if existing else None)
    now = datetime.now()

    if existing:
        existing.check_in    = check_in or existing.check_in
        existing.check_out   = check_out
        existing.status      = "completed" if check_out else "ongoing"
        existing.shift_type  = determine_shift_type(emp.shift_start, actual_check_in=effective_check_in)
        if existing.check_in and existing.check_out:
            existing.hours_worked = safe_hours(
                existing.check_in, existing.check_out, existing.total_break_minutes or 0
            )
        db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", timestamp=now, source="ADMIN"))
        msg = "Attendance record updated"
    else:
        db.add(Attendance(
            employee_id=emp.employee_id,
            user_id=emp.user_id,
            check_in=check_in,
            check_out=check_out,
            status="completed" if check_out else "ongoing",
            hours_worked=safe_hours(check_in, check_out) if check_out else None,
            shift_type=determine_shift_type(emp.shift_start, actual_check_in=check_in),
            week_number=check_in.isocalendar()[1] if check_in else datetime.now().isocalendar()[1],
            shift_start=emp.shift_start,
            shift_end=emp.shift_end,
            duty_hour=emp.duty_hour,
        ))
        db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", timestamp=now, source="ADMIN"))
        msg = "New record created"

    db.commit()
    return {"message": msg}


# ---------------------------------------------------------------------------
# PUT /{attendance_id}
# ---------------------------------------------------------------------------

@router.put("/{attendance_id}")
async def update_attendance(
    attendance_id: str,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "auditor"]))
):
    record = None

    if attendance_id.startswith("temp-"):
        emp_id = data.get("employee_id")
        if not emp_id:
            raise HTTPException(status_code=400, detail="employee_id required for temporary records")
        check_in_dt = strip_tz(parse_iso(data.get("check_in")))
        if check_in_dt:
            try:
                record = db.query(Attendance).filter(
                    Attendance.employee_id == emp_id,
                    func.date(Attendance.check_in) == check_in_dt.date()
                ).first()
            except (ValueError, AttributeError) as e:
                raise HTTPException(status_code=400, detail=f"Invalid check_in date: {e}")
    else:
        try:
            record = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid attendance ID")

    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    new_check_in = strip_tz(parse_iso(data.get("check_in")))
    if new_check_in:
        record.check_in = new_check_in

    check_out_raw = data.get("check_out")
    if check_out_raw and str(check_out_raw).strip() not in ("", "null", "None"):
        new_check_out = strip_tz(parse_iso(str(check_out_raw)))
        if new_check_out:
            new_check_out    = fix_cross_midnight_checkout(record.check_in, new_check_out)
            record.check_out = new_check_out
            record.status    = "completed"
        else:
            record.check_out = None
            record.status    = "ongoing"
    else:
        record.check_out = None
        record.status    = "ongoing"

    if record.check_in:
        emp     = db.query(Employee).filter(Employee.employee_id == record.employee_id).first()
        s_start = record.shift_start or (emp.shift_start if emp else "08:00")
        record.shift_type = determine_shift_type(s_start, actual_check_in=record.check_in)

    if record.check_in and record.check_out:
        record.hours_worked = safe_hours(
            record.check_in, record.check_out, record.total_break_minutes or 0
        )
    else:
        record.hours_worked = 0.0

    db.add(AttendanceLog(
        employee_id=record.employee_id,
        type="MANUAL_EDIT",
        timestamp=datetime.now(),
        source="ADMIN_PANEL",
    ))
    db.commit()
    return {"message": "Updated successfully", "id": record.id}


# ---------------------------------------------------------------------------
# DELETE /{attendance_id}
# ---------------------------------------------------------------------------

@router.delete("/{attendance_id}")
async def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin"]))
):
    record = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted successfully"}


# ---------------------------------------------------------------------------
# POST /mark-absents
# ---------------------------------------------------------------------------

@router.post("/mark-absents")
def mark_absent_employees(
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin"]))
):
    now       = datetime.now()
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    absent_count = 0

    for emp in employees:
        shift_time_str = emp.shift_start or "07:00"
        try:
            h, m = map(int, shift_time_str.split(":"))
        except ValueError:
            h, m = 7, 0

        expected_start = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if expected_start > now:
            expected_start -= timedelta(days=1)

        if now <= (expected_start + timedelta(hours=1)):
            continue

        window_start = expected_start - timedelta(hours=4)
        window_end   = expected_start + timedelta(hours=16)

        exists = db.query(Attendance).filter(
            Attendance.employee_id == emp.employee_id,
            Attendance.check_in   >= window_start,
            Attendance.check_in   <= window_end,
        ).first()

        if not exists:
            db.add(Attendance(
                employee_id=emp.employee_id,
                user_id=emp.user_id,
                check_in=expected_start,
                status="Absent",
                hours_worked=0.0,
                shift_type=determine_shift_type(emp.shift_start),
                week_number=expected_start.isocalendar()[1],
                shift_start=emp.shift_start,
                shift_end=emp.shift_end,
                duty_hour=emp.duty_hour,
            ))
            absent_count += 1

    db.commit()
    return {"message": f"Scan complete. {absent_count} employees marked absent."}


# ---------------------------------------------------------------------------
# POST /auto-close-stale  — PROBLEM 1 FIX applied here too
# ---------------------------------------------------------------------------

@router.post("/auto-close-stale")
def auto_close_stale_shifts(
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin"]))
):
    now = datetime.now()

    open_shifts = db.query(Attendance).options(joinedload(Attendance.employee_record)).filter(
        Attendance.status.in_(["ongoing", "on_break"])
    ).all()

    closed_count = 0

    for active in open_shifts:
        if not active.check_in:
            continue

        emp = active.employee_record

        # PROBLEM 1 FIX: use get_shift_start_dt for correct deadline base
        # Old code: shift_start_dt = check_in.replace(hour=s_h, minute=s_m)
        #   → wrong when shift_start is more than 4h after check_in's time-of-day
        # New code: always computes the shift_start that is <= check_in
        shift_start_str = active.shift_start or (emp.shift_start if emp else "08:00")
        shift_start_dt  = get_shift_start_dt(active.check_in, shift_start_str)

        penalty_hours = 20 if (emp and emp.has_split_shift) else 16
        deadline      = shift_start_dt + timedelta(hours=penalty_hours)

        if now >= deadline:
            active.status       = "completed"
            active.hours_worked = 0.0
            db.add(AttendanceLog(
                employee_id=active.employee_id,
                type="SYSTEM_AUTO_CLOSE",
                timestamp=now,
                source="SYSTEM_SWEEP"
            ))
            closed_count += 1

    if closed_count > 0:
        db.commit()

    return {"message": f"Scan complete. {closed_count} abandoned shifts auto-closed with 0 hours."}


    # check git push ok or not














# from fastapi import APIRouter, Depends, HTTPException, Body
# from sqlalchemy import func
# from sqlalchemy.orm import Session, joinedload
# from datetime import datetime, timedelta, timezone
# from typing import Optional
# from app.core.database import get_db
# from app.core.auth import roles_required
# from app.models.attendance import Attendance, AttendanceLog
# from app.models.employee import Employee

# router = APIRouter()


# # ---------------------------------------------------------------------------
# # Helpers
# # ---------------------------------------------------------------------------

# def utcnow() -> datetime:
#     return datetime.now(timezone.utc)


# def calculate_hours(check_in: datetime, check_out: datetime) -> float:
#     """Decimal hours between two timestamps. Always >= 0."""
#     if not check_in or not check_out:
#         return 0.0
#     total_seconds = (check_out - check_in).total_seconds()
#     return max(0.0, round(total_seconds / 3600.0, 2))


# def safe_hours(check_in: datetime, check_out: datetime, break_minutes: float = 0.0) -> float:
#     return max(0.0, round(calculate_hours(check_in, check_out) - break_minutes / 60.0, 2))


# def parse_iso(dt_str: str) -> Optional[datetime]:
#     if not dt_str:
#         return None
#     try:
#         dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
#         if dt.tzinfo is None:
#             dt = dt.replace(tzinfo=timezone.utc)
#         return dt
#     except ValueError:
#         return None


# def strip_tz(dt: Optional[datetime]) -> Optional[datetime]:
#     """Remove timezone info for naive-datetime DB columns."""
#     if dt is None:
#         return None
#     return dt.replace(tzinfo=None) if dt.tzinfo else dt


# # ---------------------------------------------------------------------------
# # FIX A: fix_cross_midnight_checkout
# #
# # PROBLEM (Images 1 & 3 — "0h 00m" duration):
# #   Ishfaq Ahmed  Apr 25: IN 12:00 PM  OUT 12:48 AM  → stored as 0h 00m
# #   Abdul Abeer   Apr 02: IN 07:15 PM  OUT 09:33 AM  → stored as 0h 00m
# #
# # ROOT CAUSE:
# #   Naive datetimes have no date part for the checkout when it crosses midnight.
# #   check_out (e.g. 00:48) < check_in (e.g. 12:00) on the same calendar date
# #   → subtraction yields negative → max(0.0, negative) = 0.0
# #
# # FIX:
# #   If check_out < check_in, the punch crossed midnight — add 1 day to check_out.
# #   A 24-hour sanity guard prevents false corrections on genuine data errors.
# # ---------------------------------------------------------------------------

# def fix_cross_midnight_checkout(
#     check_in: Optional[datetime],
#     check_out: Optional[datetime]
# ) -> Optional[datetime]:
#     if check_in is None or check_out is None:
#         return check_out
#     if check_out < check_in:
#         adjusted = check_out + timedelta(days=1)
#         # Sanity: corrected span must not exceed 24 hours
#         if (adjusted - check_in).total_seconds() <= 86400:
#             return adjusted
#     return check_out


# # ---------------------------------------------------------------------------
# # FIX B: determine_shift_type — classify by ACTUAL check_in, not shift_start
# #
# # RULE  : 02:00 AM (02:00) to 02:00 PM (14:00) inclusive → "Day", else → "Night"
# #
# # PROBLEM (Images 2 & 3 — inconsistent/wrong shift badge):
# #   Md Faruq   Apr 12–15: IN 12:00 AM → NIGHT ✅  Apr 16–20: IN 12:00 AM → DAY ❌
# #   Abdul Abeer Apr 03  : IN 08:01 AM → NIGHT ❌  (employee's shift_start was "20:00")
# #
# # ROOT CAUSE:
# #   shift_type was written from emp.shift_start at record creation, not from the
# #   real check_in hour. Employees who punch in outside their scheduled window
# #   (or whose shift_start changed) kept the wrong label forever.
# #   Also, some records had stale values written before any fix was applied.
# #
# # FIX:
# #   Pass actual_check_in whenever we have a real timestamp. The function
# #   classifies by the punch hour, not the schedule. Falls back to shift_start_str
# #   only for absent rows where no real punch exists.
# # ---------------------------------------------------------------------------

# def determine_shift_type(
#     shift_start_str: str,
#     actual_check_in: Optional[datetime] = None
# ) -> str:
#     """
#     Returns 'Day'  : punch/schedule between 02:00 and 14:00 inclusive
#     Returns 'Night': punch/schedule between 00:00–01:59 or 14:01–23:59
#     Returns 'Unknown': no usable time data

#     Priority: actual_check_in hour > shift_start_str > 'Unknown'
#     """
#     # Priority 1: real punch hour (most accurate)
#     if actual_check_in is not None:
#         total_mins = actual_check_in.hour * 60 + actual_check_in.minute
#         return "Day" if 120 <= total_mins <= 840 else "Night"

#     # Priority 2: scheduled shift_start string
#     if not shift_start_str or not shift_start_str.strip():
#         return "Unknown"
#     try:
#         parts = shift_start_str.strip().split(":")
#         if len(parts) < 2:
#             return "Unknown"
#         h, m = int(parts[0]), int(parts[1])
#         if not (0 <= h <= 23 and 0 <= m <= 59):
#             return "Unknown"
#         total_mins = h * 60 + m
#         return "Day" if 120 <= total_mins <= 840 else "Night"
#     except (ValueError, IndexError):
#         return "Unknown"


# # ---------------------------------------------------------------------------
# # GET /stats
# # ---------------------------------------------------------------------------

# @router.get("/stats")
# def get_attendance_stats(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     total_employees = db.query(Employee).filter(Employee.is_active == True).count()

#     now_naive   = datetime.now()
#     time_limit  = now_naive - timedelta(hours=24)
#     today_start = now_naive.replace(hour=0, minute=0, second=0, microsecond=0)

#     present_now = db.query(Attendance).filter(
#         Attendance.status.in_(["ongoing", "on_break"]),
#         Attendance.check_in >= time_limit
#     ).count()

#     absent_count = db.query(Attendance).filter(
#         Attendance.status == "Absent",
#         Attendance.check_in >= today_start
#     ).count()

#     return {
#         "present_now":     present_now,
#         "absent":          absent_count,
#         "total_employees": total_employees,
#         "last_updated":    now_naive.isoformat(),
#     }


# # ---------------------------------------------------------------------------
# # GET /all  and  GET /summary
# # ---------------------------------------------------------------------------

# def _attendance_list(db: Session):
#     logs = (
#         db.query(Attendance)
#         .options(joinedload(Attendance.employee_record).joinedload(Employee.user))
#         .order_by(Attendance.check_in.desc())
#         .all()
#     )
#     results = []
#     for a in logs:
#         emp     = a.employee_record
#         s_start = getattr(a, "shift_start", None) or (getattr(emp, "shift_start", "08:00") if emp else "08:00")
#         s_end   = getattr(a, "shift_end",   None) or (getattr(emp, "shift_end",   "20:00") if emp else "20:00")
#         d_hour  = getattr(a, "duty_hour",   None) or (getattr(emp, "duty_hour",   12.0)    if emp else 12.0)

#         # FIX B (read path): always reclassify from actual check_in hour.
#         # This corrects ALL stale/wrong values already in the DB without a migration.
#         resolved_shift_type = determine_shift_type(s_start, actual_check_in=a.check_in)

#         # FIX A (read path): recompute hours_worked on the fly for legacy records
#         # that were saved as 0.0 due to the cross-midnight bug. This makes existing
#         # data show correctly immediately without any DB migration.
#         hours_worked = a.hours_worked or 0.0
#         if (
#             a.status == "completed"
#             and a.check_in
#             and a.check_out
#             and hours_worked == 0.0
#         ):
#             fixed_co   = fix_cross_midnight_checkout(a.check_in, a.check_out)
#             recomputed = safe_hours(a.check_in, fixed_co, a.total_break_minutes or 0)
#             if recomputed > 0:
#                 hours_worked = recomputed

#         results.append({
#             "id":           a.id,
#             "employee_id":  a.employee_id,
#             "name":         emp.user.name if emp and emp.user else "Unknown",
#             "department":   emp.department if emp else "Main",
#             "shift_start":  s_start,
#             "shift_end":    s_end,
#             "duty_hour":    d_hour,
#             "check_in":     a.check_in.isoformat()  if a.check_in  else None,
#             "check_out":    a.check_out.isoformat() if a.check_out else None,
#             "hours_worked": hours_worked,
#             "shift_type":   resolved_shift_type,
#             "status":       a.status,
#             "date":         (a.check_in.date().isoformat() if a.check_in
#                              else (a.date.isoformat() if getattr(a, "date", None) else None)),
#         })
#     return results


# @router.get("/all")
# def get_attendance_all(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     return _attendance_list(db)


# @router.get("/summary")
# def get_attendance_summary(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     return _attendance_list(db)


# # ---------------------------------------------------------------------------
# # POST /sync-zk-log
# # ---------------------------------------------------------------------------

# @router.post("/sync-zk-log")
# async def sync_zk_log(
#     employee_id: str,
#     timestamp: str,
#     db: Session = Depends(get_db)
# ):
#     ts_dt = strip_tz(parse_iso(timestamp)) or datetime.now()

#     emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
#     if not emp or not emp.is_active:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     is_split_worker = emp.has_split_shift

#     # Double-tap protection
#     last_log = (
#         db.query(AttendanceLog)
#         .filter(AttendanceLog.employee_id == employee_id)
#         .order_by(AttendanceLog.timestamp.desc())
#         .first()
#     )
#     if last_log and (ts_dt - last_log.timestamp).total_seconds() < 3600:
#         return {"action": "ignored", "reason": "double_tap"}

#     # Find latest shift
#     latest_shift = (
#         db.query(Attendance)
#         .filter(Attendance.employee_id == employee_id)
#         .order_by(Attendance.check_in.desc())
#         .first()
#     )

#     active = None
#     if latest_shift:
#         if latest_shift.check_in:
#             try:
#                 s_h, s_m = map(int, (latest_shift.shift_start or "08:00").split(":"))
#             except ValueError:
#                 s_h, s_m = 8, 0

#             shift_start_dt = latest_shift.check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)

#             if latest_shift.check_in.hour >= 22 and s_h < 4:
#                 shift_start_dt += timedelta(days=1)

#             penalty_hours   = 20 if is_split_worker else 16
#             cutoff_deadline = shift_start_dt + timedelta(hours=penalty_hours)

#             if ts_dt >= cutoff_deadline:
#                 if latest_shift.status in ["ongoing", "on_break"]:
#                     latest_shift.status       = "completed"
#                     latest_shift.hours_worked = 0.0
#                     db.add(AttendanceLog(
#                         employee_id=employee_id,
#                         type="SYSTEM_AUTO_CLOSE",
#                         timestamp=ts_dt,
#                         source="ZK_MACHINE_OVERRIDE"
#                     ))
#                     db.commit()
#                 active = None
#             else:
#                 active = latest_shift
#         else:
#             active = latest_shift

#     punch_type = "IN" if not active or active.status == "Absent" else "OUT"
#     db.add(AttendanceLog(
#         employee_id=employee_id,
#         timestamp=ts_dt,
#         type=punch_type,
#         source="ZK_MACHINE",
#     ))

#     # PUNCH 1: Duty Start
#     if not active or active.status == "Absent":
#         if active and active.status == "Absent":
#             active.check_in   = ts_dt
#             active.status     = "ongoing"
#             active.shift_start = emp.shift_start
#             active.shift_end  = emp.shift_end
#             active.duty_hour  = emp.duty_hour
#             # FIX B: classify by actual punch time
#             active.shift_type = determine_shift_type(emp.shift_start, actual_check_in=ts_dt)
#             db.commit()
#             return {"action": "absent_overwritten", "punch": 1}
#         else:
#             db.add(Attendance(
#                 employee_id=employee_id,
#                 user_id=emp.user_id,
#                 check_in=ts_dt,
#                 status="ongoing",
#                 week_number=ts_dt.isocalendar()[1],
#                 shift_start=emp.shift_start,
#                 shift_end=emp.shift_end,
#                 duty_hour=emp.duty_hour,
#                 # FIX B: classify by actual punch time
#                 shift_type=determine_shift_type(emp.shift_start, actual_check_in=ts_dt)
#             ))
#             db.commit()
#             return {"action": "check_in_recorded", "punch": 1}

#     # NORMAL WORKER LOGIC
#     if not is_split_worker:
#         # FIX A: apply cross-midnight correction before computing hours
#         fixed_out = fix_cross_midnight_checkout(active.check_in, ts_dt)
#         active.status       = "completed"
#         active.check_out    = ts_dt   # store original timestamp
#         active.hours_worked = max(0.0, round(
#             (fixed_out - active.check_in).total_seconds() / 3600.0, 2
#         ))
#         db.commit()
#         return {"action": "checkout_updated", "hours": active.hours_worked}

#     # SPLIT WORKER LOGIC (4-Punch Cycle)
#     if active.status == "ongoing":
#         if not active.last_break_start:
#             # PUNCH 2: Break Start
#             active.status           = "on_break"
#             active.last_break_start = ts_dt
#             db.commit()
#             return {"action": "break_started", "punch": 2}
#         else:
#             # PUNCH 4: Check Out — FIX A
#             fixed_out = fix_cross_midnight_checkout(active.check_in, ts_dt)
#             active.status       = "completed"
#             active.check_out    = ts_dt
#             active.hours_worked = safe_hours(active.check_in, fixed_out, active.total_break_minutes or 0)
#             db.commit()
#             return {"action": "checkout_completed", "hours": active.hours_worked, "punch": 4}

#     elif active.status == "on_break":
#         # PUNCH 3: Break End (With 15+15=30 min grace)
#         active.status = "ongoing"
#         raw_break_mins      = (ts_dt - active.last_break_start).total_seconds() / 60
#         billable_break_mins = max(0.0, raw_break_mins - 30.0)
#         active.total_break_minutes = (active.total_break_minutes or 0) + billable_break_mins
#         db.commit()
#         return {"action": "returned_from_break", "punch": 3}

#     elif active.status == "completed":
#         # 5TH PUNCH OR MORE: extend checkout — FIX A
#         fixed_out = fix_cross_midnight_checkout(active.check_in, ts_dt)
#         active.check_out    = ts_dt
#         active.hours_worked = safe_hours(active.check_in, fixed_out, active.total_break_minutes or 0)
#         db.commit()
#         return {"action": "checkout_extended", "hours": active.hours_worked}

#     return {"action": "no_change"}


# # ---------------------------------------------------------------------------
# # POST /manual
# # ---------------------------------------------------------------------------

# @router.post("/manual")
# async def add_manual_attendance(
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     emp = db.query(Employee).filter(Employee.employee_id == data.get("employee_id", "")).first()
#     if not emp:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     try:
#         check_in  = strip_tz(parse_iso(data.get("check_in")))
#         check_out = strip_tz(parse_iso(data.get("check_out")))
#     except (ValueError, AttributeError):
#         raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

#     if not check_in:
#         raise HTTPException(status_code=400, detail="check_in is required.")

#     # FIX A: correct cross-midnight before any duration calculation
#     check_out = fix_cross_midnight_checkout(check_in, check_out)

#     try:
#         s_h, s_m = map(int, (emp.shift_start or "08:00").split(":"))
#         e_h, e_m = map(int, (emp.shift_end   or "20:00").split(":"))
#     except ValueError:
#         s_h, s_m, e_h, e_m = 8, 0, 20, 0

#     shift_start_dt = check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)
#     is_late        = check_in > (shift_start_dt + timedelta(minutes=15))

#     attendance_label = "Normal"
#     if check_out:
#         shift_end_dt = check_in.replace(hour=e_h, minute=e_m, second=0, microsecond=0)
#         if e_h < s_h:
#             shift_end_dt += timedelta(days=1)
#         if (shift_end_dt - check_out).total_seconds() / 60 > 10:
#             attendance_label = "Early Leave"

#     today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
#     today_end   = today_start + timedelta(days=1)
#     if check_in.hour >= 22 and s_h == 0:
#         today_start -= timedelta(days=1)
#         today_end   -= timedelta(days=1)

#     existing = db.query(Attendance).filter(
#         Attendance.employee_id == emp.employee_id,
#         Attendance.check_in   >= today_start,
#         Attendance.check_in   <  today_end,
#     ).first()

#     now = datetime.now()
#     if existing:
#         existing.check_in     = check_in
#         existing.check_out    = check_out
#         existing.status       = "completed" if check_out else "ongoing"
#         # FIX B: reclassify by actual check_in hour
#         existing.shift_type   = determine_shift_type(emp.shift_start, actual_check_in=check_in)
#         if existing.check_in and existing.check_out:
#             existing.hours_worked = safe_hours(
#                 existing.check_in, existing.check_out, existing.total_break_minutes or 0
#             )
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", timestamp=now, source="ADMIN"))
#         msg = "Attendance record updated"
#     else:
#         db.add(Attendance(
#             employee_id=emp.employee_id,
#             user_id=emp.user_id,
#             check_in=check_in,
#             check_out=check_out,
#             status="completed" if check_out else "ongoing",
#             hours_worked=safe_hours(check_in, check_out) if check_out else None,
#             # FIX B: classify by actual check_in hour
#             shift_type=determine_shift_type(emp.shift_start, actual_check_in=check_in),
#             week_number=check_in.isocalendar()[1],
#             shift_start=emp.shift_start,
#             shift_end=emp.shift_end,
#             duty_hour=emp.duty_hour,
#         ))
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", timestamp=now, source="ADMIN"))
#         msg = "New manual entry created"

#     db.commit()
#     return {"message": msg, "label_calculated": attendance_label, "is_late": is_late}


# # ---------------------------------------------------------------------------
# # PUT /attendance/{attendance_id}
# # ---------------------------------------------------------------------------

# @router.put("/attendance/{attendance_id}")
# async def update_attendance_by_id(
#     attendance_id: str,
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     emp = db.query(Employee).filter(Employee.employee_id == data.get("employee_id", "")).first()
#     if not emp:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     check_in  = strip_tz(parse_iso(data.get("check_in")))
#     check_out = strip_tz(parse_iso(data.get("check_out")))

#     # FIX A
#     check_out = fix_cross_midnight_checkout(check_in, check_out)

#     existing = None
#     if not attendance_id.startswith("temp-"):
#         try:
#             existing = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()
#         except (ValueError, TypeError):
#             raise HTTPException(status_code=400, detail="Invalid attendance ID")

#     if not existing and check_in:
#         today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
#         today_end   = today_start + timedelta(days=1)
#         existing    = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.check_in   >= today_start,
#             Attendance.check_in   <  today_end,
#         ).first()

#     effective_check_in = check_in or (existing.check_in if existing else None)
#     now = datetime.now()

#     if existing:
#         existing.check_in    = check_in or existing.check_in
#         existing.check_out   = check_out
#         existing.status      = "completed" if check_out else "ongoing"
#         # FIX B
#         existing.shift_type  = determine_shift_type(emp.shift_start, actual_check_in=effective_check_in)
#         if existing.check_in and existing.check_out:
#             existing.hours_worked = safe_hours(
#                 existing.check_in, existing.check_out, existing.total_break_minutes or 0
#             )
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", timestamp=now, source="ADMIN"))
#         msg = "Attendance record updated"
#     else:
#         db.add(Attendance(
#             employee_id=emp.employee_id,
#             user_id=emp.user_id,
#             check_in=check_in,
#             check_out=check_out,
#             status="completed" if check_out else "ongoing",
#             hours_worked=safe_hours(check_in, check_out) if check_out else None,
#             shift_type=determine_shift_type(emp.shift_start, actual_check_in=check_in),
#             week_number=check_in.isocalendar()[1] if check_in else datetime.now().isocalendar()[1],
#             shift_start=emp.shift_start,
#             shift_end=emp.shift_end,
#             duty_hour=emp.duty_hour,
#         ))
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", timestamp=now, source="ADMIN"))
#         msg = "New record created"

#     db.commit()
#     return {"message": msg}


# # ---------------------------------------------------------------------------
# # PUT /{attendance_id}
# # ---------------------------------------------------------------------------

# @router.put("/{attendance_id}")
# async def update_attendance(
#     attendance_id: str,
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     record = None

#     if attendance_id.startswith("temp-"):
#         emp_id = data.get("employee_id")
#         if not emp_id:
#             raise HTTPException(status_code=400, detail="employee_id required for temporary records")
#         check_in_dt = strip_tz(parse_iso(data.get("check_in")))
#         if check_in_dt:
#             try:
#                 record = db.query(Attendance).filter(
#                     Attendance.employee_id == emp_id,
#                     func.date(Attendance.check_in) == check_in_dt.date()
#                 ).first()
#             except (ValueError, AttributeError) as e:
#                 raise HTTPException(status_code=400, detail=f"Invalid check_in date: {e}")
#     else:
#         try:
#             record = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()
#         except (ValueError, TypeError):
#             raise HTTPException(status_code=400, detail="Invalid attendance ID")

#     if not record:
#         raise HTTPException(status_code=404, detail="Attendance record not found")

#     new_check_in = strip_tz(parse_iso(data.get("check_in")))
#     if new_check_in:
#         record.check_in = new_check_in

#     check_out_raw = data.get("check_out")
#     if check_out_raw and str(check_out_raw).strip() not in ("", "null", "None"):
#         new_check_out = strip_tz(parse_iso(str(check_out_raw)))
#         if new_check_out:
#             # FIX A: cross-midnight correction
#             new_check_out    = fix_cross_midnight_checkout(record.check_in, new_check_out)
#             record.check_out = new_check_out
#             record.status    = "completed"
#         else:
#             record.check_out = None
#             record.status    = "ongoing"
#     else:
#         record.check_out = None
#         record.status    = "ongoing"

#     # FIX B: always reclassify from actual check_in
#     if record.check_in:
#         emp     = db.query(Employee).filter(Employee.employee_id == record.employee_id).first()
#         s_start = record.shift_start or (emp.shift_start if emp else "08:00")
#         record.shift_type = determine_shift_type(s_start, actual_check_in=record.check_in)

#     if record.check_in and record.check_out:
#         record.hours_worked = safe_hours(
#             record.check_in, record.check_out, record.total_break_minutes or 0
#         )
#     else:
#         record.hours_worked = 0.0

#     db.add(AttendanceLog(
#         employee_id=record.employee_id,
#         type="MANUAL_EDIT",
#         timestamp=datetime.now(),
#         source="ADMIN_PANEL",
#     ))
#     db.commit()
#     return {"message": "Updated successfully", "id": record.id}


# # ---------------------------------------------------------------------------
# # DELETE /{attendance_id}
# # ---------------------------------------------------------------------------

# @router.delete("/{attendance_id}")
# async def delete_attendance(
#     attendance_id: int,
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin"]))
# ):
#     record = db.query(Attendance).filter(Attendance.id == attendance_id).first()
#     if not record:
#         raise HTTPException(status_code=404, detail="Record not found")
#     db.delete(record)
#     db.commit()
#     return {"message": "Deleted successfully"}


# # ---------------------------------------------------------------------------
# # POST /mark-absents
# # ---------------------------------------------------------------------------

# @router.post("/mark-absents")
# def mark_absent_employees(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin"]))
# ):
#     now       = datetime.now()
#     employees = db.query(Employee).filter(Employee.is_active == True).all()
#     absent_count = 0

#     for emp in employees:
#         shift_time_str = emp.shift_start or "07:00"
#         try:
#             h, m = map(int, shift_time_str.split(":"))
#         except ValueError:
#             h, m = 7, 0

#         expected_start = now.replace(hour=h, minute=m, second=0, microsecond=0)
#         if expected_start > now:
#             expected_start -= timedelta(days=1)

#         if now <= (expected_start + timedelta(hours=1)):
#             continue

#         window_start = expected_start - timedelta(hours=4)
#         window_end   = expected_start + timedelta(hours=16)

#         exists = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.check_in   >= window_start,
#             Attendance.check_in   <= window_end,
#         ).first()

#         if not exists:
#             db.add(Attendance(
#                 employee_id=emp.employee_id,
#                 user_id=emp.user_id,
#                 check_in=expected_start,
#                 status="Absent",
#                 hours_worked=0.0,
#                 # Absent rows: no real punch → use schedule string
#                 shift_type=determine_shift_type(emp.shift_start),
#                 week_number=expected_start.isocalendar()[1],
#                 shift_start=emp.shift_start,
#                 shift_end=emp.shift_end,
#                 duty_hour=emp.duty_hour,
#             ))
#             absent_count += 1

#     db.commit()
#     return {"message": f"Scan complete. {absent_count} employees marked absent."}


# # ---------------------------------------------------------------------------
# # POST /auto-close-stale
# # ---------------------------------------------------------------------------

# @router.post("/auto-close-stale")
# def auto_close_stale_shifts(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin"]))
# ):
#     now = datetime.now()

#     open_shifts = db.query(Attendance).options(joinedload(Attendance.employee_record)).filter(
#         Attendance.status.in_(["ongoing", "on_break"])
#     ).all()

#     closed_count = 0

#     for active in open_shifts:
#         if not active.check_in:
#             continue

#         emp = active.employee_record

#         try:
#             s_h, s_m = map(int, (active.shift_start or "08:00").split(":"))
#         except ValueError:
#             s_h, s_m = 8, 0

#         shift_start_dt = active.check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)

#         if active.check_in.hour >= 22 and s_h < 4:
#             shift_start_dt += timedelta(days=1)
#         elif active.check_in.hour <= 4 and s_h >= 22:
#             shift_start_dt -= timedelta(days=1)

#         penalty_hours = 20 if (emp and emp.has_split_shift) else 16
#         deadline      = shift_start_dt + timedelta(hours=penalty_hours)

#         if now >= deadline:
#             active.status       = "completed"
#             active.hours_worked = 0.0
#             db.add(AttendanceLog(
#                 employee_id=active.employee_id,
#                 type="SYSTEM_AUTO_CLOSE",
#                 timestamp=now,
#                 source="SYSTEM_SWEEP"
#             ))
#             closed_count += 1

#     if closed_count > 0:
#         db.commit()

#     return {"message": f"Scan complete. {closed_count} abandoned shifts auto-closed with 0 hours."}












# from fastapi import APIRouter, Depends, HTTPException, Body
# from sqlalchemy import func
# from sqlalchemy.orm import Session, joinedload
# from datetime import datetime, timedelta, timezone
# from typing import Optional
# from app.core.database import get_db
# from app.core.auth import roles_required
# from app.models.attendance import Attendance, AttendanceLog
# from app.models.employee import Employee

# router = APIRouter()


# # ---------------------------------------------------------------------------
# # Helpers
# # ---------------------------------------------------------------------------

# def utcnow() -> datetime:
#     return datetime.now(timezone.utc)


# def calculate_hours(check_in: datetime, check_out: datetime) -> float:
#     """Decimal hours between two timestamps. Always >= 0."""
#     if not check_in or not check_out:
#         return 0.0
#     total_seconds = (check_out - check_in).total_seconds()
#     return max(0.0, round(total_seconds / 3600.0, 2))


# def safe_hours(check_in: datetime, check_out: datetime, break_minutes: float = 0.0) -> float:
#     return max(0.0, round(calculate_hours(check_in, check_out) - break_minutes / 60.0, 2))


# def parse_iso(dt_str: str) -> Optional[datetime]:
#     if not dt_str:
#         return None
#     try:
#         dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
#         if dt.tzinfo is None:
#             dt = dt.replace(tzinfo=timezone.utc)
#         return dt
#     except ValueError:
#         return None


# def strip_tz(dt: Optional[datetime]) -> Optional[datetime]:
#     """Remove timezone info for naive-datetime DB columns."""
#     if dt is None:
#         return None
#     return dt.replace(tzinfo=None) if dt.tzinfo else dt


# # ---------------------------------------------------------------------------
# # FIX: determine_shift_type
# #
# # RULE: shift_start from 02:00 AM (02:00) to 02:00 PM (14:00) inclusive → "Day"
# #       anything outside that window → "Night"
# #
# # BUGS FIXED:
# #   1. The previous code returned "Day" as a blanket default when shift_start_str
# #      was empty/None. Employees with no shift configured were silently mislabeled.
# #      Now returns "Unknown" for missing data so the caller can decide.
# #
# #   2. The boundary logic itself (120 <= total_mins <= 840) was mathematically
# #      correct but the inline comment said "02:00 AM to 02:00 PM inclusive" yet
# #      the ValueError fallback still returned "Day" — masking bad data. Fixed
# #      to return "Unknown" on parse failure too.
# #
# #   3. Edge-case: 14:00 (840 min) is the last valid Day minute. 14:01+ → Night.
# #      This was already handled correctly; clarified in comment.
# # ---------------------------------------------------------------------------

# def determine_shift_type(shift_start_str: str) -> str:
#     """
#     Returns 'Day' if shift starts between 02:00 (inclusive) and 14:00 (inclusive).
#     Returns 'Night' for everything outside that window (00:00–01:59, 14:01–23:59).
#     Returns 'Unknown' when shift_start_str is missing or unparseable — callers
#     should treat 'Unknown' as a data-quality signal, not silently treat it as Day.
#     """
#     if not shift_start_str or not shift_start_str.strip():
#         return "Unknown"
#     try:
#         parts = shift_start_str.strip().split(":")
#         if len(parts) < 2:
#             return "Unknown"
#         h, m = int(parts[0]), int(parts[1])
#         if not (0 <= h <= 23 and 0 <= m <= 59):
#             return "Unknown"
#         total_mins = (h * 60) + m
#         # Day  : 02:00 AM = 120 min  …  02:00 PM = 840 min  (inclusive both ends)
#         # Night: 00:00–01:59  and  14:01–23:59
#         return "Day" if 120 <= total_mins <= 840 else "Night"
#     except (ValueError, IndexError):
#         return "Unknown"


# # ---------------------------------------------------------------------------
# # GET /stats
# # ---------------------------------------------------------------------------

# @router.get("/stats")
# def get_attendance_stats(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     total_employees = db.query(Employee).filter(Employee.is_active == True).count()

#     now_naive  = datetime.now()
#     time_limit = now_naive - timedelta(hours=24)
#     today_start = now_naive.replace(hour=0, minute=0, second=0, microsecond=0)

#     present_now = db.query(Attendance).filter(
#         Attendance.status.in_(["ongoing", "on_break"]),
#         Attendance.check_in >= time_limit
#     ).count()

#     # Absent records store the SCHEDULED shift start as check_in,
#     # so use today_start not time_limit to avoid miscounting yesterday's absents.
#     absent_count = db.query(Attendance).filter(
#         Attendance.status == "Absent",
#         Attendance.check_in >= today_start
#     ).count()

#     return {
#         "present_now":    present_now,
#         "absent":         absent_count,
#         "total_employees": total_employees,
#         "last_updated":   now_naive.isoformat(),
#     }


# # ---------------------------------------------------------------------------
# # GET /all  and  GET /summary
# # ---------------------------------------------------------------------------

# def _attendance_list(db: Session):
#     logs = (
#         db.query(Attendance)
#         .options(joinedload(Attendance.employee_record).joinedload(Employee.user))
#         .order_by(Attendance.check_in.desc())
#         .all()
#     )
#     results = []
#     for a in logs:
#         emp     = a.employee_record
#         s_start = getattr(a, "shift_start", None) or (getattr(emp, "shift_start", "08:00") if emp else "08:00")
#         s_end   = getattr(a, "shift_end",   None) or (getattr(emp, "shift_end",   "20:00") if emp else "20:00")
#         d_hour  = getattr(a, "duty_hour",   None) or (getattr(emp, "duty_hour",   12.0)    if emp else 12.0)

#         # Resolve shift_type: prefer stored value; fall back to calculation.
#         # If stored value is falsy (None / "" / "Unknown"), recalculate from s_start.
#         stored_shift_type = a.shift_type
#         if stored_shift_type and stored_shift_type not in ("", "Unknown"):
#             resolved_shift_type = stored_shift_type
#         else:
#             resolved_shift_type = determine_shift_type(s_start)

#         results.append({
#             "id":           a.id,
#             "employee_id":  a.employee_id,
#             "name":         emp.user.name if emp and emp.user else "Unknown",
#             "department":   emp.department if emp else "Main",
#             "shift_start":  s_start,
#             "shift_end":    s_end,
#             "duty_hour":    d_hour,
#             "check_in":     a.check_in.isoformat()  if a.check_in  else None,
#             "check_out":    a.check_out.isoformat() if a.check_out else None,
#             "hours_worked": a.hours_worked or 0.0,
#             "shift_type":   resolved_shift_type,
#             "status":       a.status,
#             "date":         (a.check_in.date().isoformat() if a.check_in
#                              else (a.date.isoformat() if getattr(a, "date", None) else None)),
#         })
#     return results


# @router.get("/all")
# def get_attendance_all(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     return _attendance_list(db)


# @router.get("/summary")
# def get_attendance_summary(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     return _attendance_list(db)


# # ---------------------------------------------------------------------------
# # POST /sync-zk-log
# # ---------------------------------------------------------------------------

# @router.post("/sync-zk-log")
# async def sync_zk_log(
#     employee_id: str,
#     timestamp: str,
#     db: Session = Depends(get_db)
# ):
#     ts_dt = strip_tz(parse_iso(timestamp)) or datetime.now()

#     emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
#     if not emp or not emp.is_active:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     is_split_worker = emp.has_split_shift

#     # Double-tap protection
#     last_log = (
#         db.query(AttendanceLog)
#         .filter(AttendanceLog.employee_id == employee_id)
#         .order_by(AttendanceLog.timestamp.desc())
#         .first()
#     )
#     if last_log and (ts_dt - last_log.timestamp).total_seconds() < 3600:
#         return {"action": "ignored", "reason": "double_tap"}

#     # Find latest shift
#     latest_shift = (
#         db.query(Attendance)
#         .filter(Attendance.employee_id == employee_id)
#         .order_by(Attendance.check_in.desc())
#         .first()
#     )

#     active = None
#     if latest_shift:
#         if latest_shift.check_in:
#             try:
#                 s_h, s_m = map(int, (latest_shift.shift_start or "08:00").split(":"))
#             except ValueError:
#                 s_h, s_m = 8, 0
                
#             shift_start_dt = latest_shift.check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)
            
#             if latest_shift.check_in.hour >= 22 and s_h < 4:
#                 shift_start_dt += timedelta(days=1)
                
#             # PENALTY WINDOW: 20 hours for split, 16 hours for normal
#             penalty_hours = 20 if is_split_worker else 16
#             cutoff_deadline = shift_start_dt + timedelta(hours=penalty_hours)
            
#             # If current punch exceeds the window, close the old shift with 0 hours
#             if ts_dt >= cutoff_deadline:
#                 if latest_shift.status in ["ongoing", "on_break"]:
#                     latest_shift.status       = "completed"
#                     latest_shift.hours_worked = 0.0
                    
#                     db.add(AttendanceLog(
#                         employee_id=employee_id, 
#                         type="SYSTEM_AUTO_CLOSE", 
#                         timestamp=ts_dt, 
#                         source="ZK_MACHINE_OVERRIDE"
#                     ))
#                     db.commit()
#                 active = None 
#             else:
#                 active = latest_shift
#         else:
#             active = latest_shift

#     punch_type = "IN" if not active or active.status == "Absent" else "OUT"
#     db.add(AttendanceLog(
#         employee_id=employee_id,
#         timestamp=ts_dt,
#         type=punch_type,
#         source="ZK_MACHINE",
#     ))

#     # PUNCH 1: Duty Start
#     if not active or active.status == "Absent":
#         if active and active.status == "Absent":
#             active.check_in    = ts_dt
#             active.status      = "ongoing"
#             active.shift_start = emp.shift_start
#             active.shift_end   = emp.shift_end
#             active.duty_hour   = emp.duty_hour
#             active.shift_type  = determine_shift_type(emp.shift_start)
#             db.commit()
#             return {"action": "absent_overwritten", "punch": 1}
#         else:
#             db.add(Attendance(
#                 employee_id=employee_id,
#                 user_id=emp.user_id,
#                 check_in=ts_dt,
#                 status="ongoing",
#                 week_number=ts_dt.isocalendar()[1],
#                 shift_start=emp.shift_start,
#                 shift_end=emp.shift_end,
#                 duty_hour=emp.duty_hour,
#                 shift_type=determine_shift_type(emp.shift_start)
#             ))
#             db.commit()
#             return {"action": "check_in_recorded", "punch": 1}

#     total_span_hours = (ts_dt - active.check_in).total_seconds() / 3600

#     # NORMAL WORKER LOGIC
#     if not is_split_worker:
#         # Any punch after the 1st within 16 hours just updates the check_out time
#         active.status       = "completed"
#         active.check_out    = ts_dt
#         active.hours_worked = max(0.0, round(total_span_hours, 2))
#         db.commit()
#         return {"action": "checkout_updated", "hours": active.hours_worked}

#     # SPLIT WORKER LOGIC (4-Punch Cycle)
#     if active.status == "ongoing":
#         if not active.last_break_start:
#             # PUNCH 2: Break Start
#             active.status           = "on_break"
#             active.last_break_start = ts_dt
#             db.commit()
#             return {"action": "break_started", "punch": 2}
#         else:
#             # PUNCH 4: Check Out
#             active.status       = "completed"
#             active.check_out    = ts_dt
#             active.hours_worked = safe_hours(active.check_in, ts_dt, active.total_break_minutes or 0)
#             db.commit()
#             return {"action": "checkout_completed", "hours": active.hours_worked, "punch": 4}

#     elif active.status == "on_break":
#         # PUNCH 3: Break End (With 15+15=30 min grace)
#         active.status = "ongoing"
#         raw_break_mins = (ts_dt - active.last_break_start).total_seconds() / 60
        
#         # 15 mins grace for break start + 15 mins for break end = 30 mins grace
#         billable_break_mins = max(0.0, raw_break_mins - 30.0)
        
#         active.total_break_minutes = (active.total_break_minutes or 0) + billable_break_mins
#         db.commit()
#         return {"action": "returned_from_break", "punch": 3}

#     elif active.status == "completed":
#         # 5TH PUNCH OR MORE (Within 20 hrs): Just extend the check out time
#         active.check_out    = ts_dt
#         active.hours_worked = safe_hours(active.check_in, ts_dt, active.total_break_minutes or 0)
#         db.commit()
#         return {"action": "checkout_extended", "hours": active.hours_worked}

#     return {"action": "no_change"}


# # ---------------------------------------------------------------------------
# # POST /manual
# # ---------------------------------------------------------------------------

# @router.post("/manual")
# async def add_manual_attendance(
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     emp = db.query(Employee).filter(Employee.employee_id == data.get("employee_id", "")).first()
#     if not emp:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     try:
#         check_in  = strip_tz(parse_iso(data.get("check_in")))
#         check_out = strip_tz(parse_iso(data.get("check_out")))
#     except (ValueError, AttributeError):
#         raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

#     if not check_in:
#         raise HTTPException(status_code=400, detail="check_in is required.")

#     try:
#         s_h, s_m = map(int, (emp.shift_start or "08:00").split(":"))
#         e_h, e_m = map(int, (emp.shift_end   or "20:00").split(":"))
#     except ValueError:
#         s_h, s_m, e_h, e_m = 8, 0, 20, 0

#     shift_start_dt = check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)
#     is_late = check_in > (shift_start_dt + timedelta(minutes=15))

#     attendance_label = "Normal"
#     if check_out:
#         shift_end_dt = check_in.replace(hour=e_h, minute=e_m, second=0, microsecond=0)
#         if e_h < s_h:                        
#             shift_end_dt += timedelta(days=1)
#         if (shift_end_dt - check_out).total_seconds() / 60 > 10:
#             attendance_label = "Early Leave"

#     today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
#     today_end   = today_start + timedelta(days=1)
#     if check_in.hour >= 22 and s_h == 0:
#         today_start -= timedelta(days=1)
#         today_end   -= timedelta(days=1)

#     existing = db.query(Attendance).filter(
#         Attendance.employee_id == emp.employee_id,
#         Attendance.check_in >= today_start,
#         Attendance.check_in <  today_end,
#     ).first()

#     now = datetime.now()
#     if existing:
#         existing.check_in    = check_in
#         existing.check_out   = check_out
#         existing.status      = "completed" if check_out else "ongoing"
#         if existing.check_in and existing.check_out:
#             existing.hours_worked = safe_hours(
#                 existing.check_in, existing.check_out, existing.total_break_minutes or 0
#             )
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", timestamp=now, source="ADMIN"))
#         msg = "Attendance record updated"
#     else:
#         db.add(Attendance(
#             employee_id=emp.employee_id,
#             user_id=emp.user_id,
#             check_in=check_in,
#             check_out=check_out,
#             status="completed" if check_out else "ongoing",
#             hours_worked=safe_hours(check_in, check_out) if check_out else None,
#             shift_type=determine_shift_type(emp.shift_start),
#             week_number=check_in.isocalendar()[1],
#             shift_start=emp.shift_start,
#             shift_end=emp.shift_end,
#             duty_hour=emp.duty_hour,
#         ))
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", timestamp=now, source="ADMIN"))
#         msg = "New manual entry created"

#     db.commit()
#     return {"message": msg, "label_calculated": attendance_label, "is_late": is_late}


# # ---------------------------------------------------------------------------
# # PUT /attendance/{attendance_id}
# # ---------------------------------------------------------------------------

# @router.put("/attendance/{attendance_id}")
# async def update_attendance_by_id(
#     attendance_id: str,
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     emp = db.query(Employee).filter(Employee.employee_id == data.get("employee_id", "")).first()
#     if not emp:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     check_in  = strip_tz(parse_iso(data.get("check_in")))
#     check_out = strip_tz(parse_iso(data.get("check_out")))

#     existing = None
#     if not attendance_id.startswith("temp-"):
#         try:
#             existing = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()
#         except (ValueError, TypeError):
#             raise HTTPException(status_code=400, detail="Invalid attendance ID")

#     if not existing and check_in:
#         today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
#         today_end   = today_start + timedelta(days=1)
#         existing = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.check_in >= today_start,
#             Attendance.check_in <  today_end,
#         ).first()

#     now = datetime.now()
#     if existing:
#         existing.check_in    = check_in or existing.check_in
#         existing.check_out   = check_out
#         existing.status      = "completed" if check_out else "ongoing"
#         if existing.check_in and existing.check_out:
#             existing.hours_worked = safe_hours(
#                 existing.check_in, existing.check_out, existing.total_break_minutes or 0
#             )
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", timestamp=now, source="ADMIN"))
#         msg = "Attendance record updated"
#     else:
#         db.add(Attendance(
#             employee_id=emp.employee_id,
#             user_id=emp.user_id,
#             check_in=check_in,
#             check_out=check_out,
#             status="completed" if check_out else "ongoing",
#             hours_worked=safe_hours(check_in, check_out) if check_out else None,
#             shift_type=determine_shift_type(emp.shift_start),
#             week_number=check_in.isocalendar()[1] if check_in else datetime.now().isocalendar()[1],
#             shift_start=emp.shift_start,
#             shift_end=emp.shift_end,
#             duty_hour=emp.duty_hour,
#         ))
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", timestamp=now, source="ADMIN"))
#         msg = "New record created"

#     db.commit()
#     return {"message": msg}


# # ---------------------------------------------------------------------------
# # PUT /{attendance_id}
# # ---------------------------------------------------------------------------

# @router.put("/{attendance_id}")
# async def update_attendance(
#     attendance_id: str,
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     record = None

#     if attendance_id.startswith("temp-"):
#         emp_id = data.get("employee_id")
#         if not emp_id:
#             raise HTTPException(status_code=400, detail="employee_id required for temporary records")
#         check_in_dt = strip_tz(parse_iso(data.get("check_in")))
#         if check_in_dt:
#             try:
#                 record = db.query(Attendance).filter(
#                     Attendance.employee_id == emp_id,
#                     func.date(Attendance.check_in) == check_in_dt.date()
#                 ).first()
#             except (ValueError, AttributeError) as e:
#                 raise HTTPException(status_code=400, detail=f"Invalid check_in date: {e}")
#     else:
#         try:
#             record = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()
#         except (ValueError, TypeError):
#             raise HTTPException(status_code=400, detail="Invalid attendance ID")

#     if not record:
#         raise HTTPException(status_code=404, detail="Attendance record not found")

#     new_check_in = strip_tz(parse_iso(data.get("check_in")))
#     if new_check_in:
#         record.check_in = new_check_in

#     check_out_raw = data.get("check_out")
#     if check_out_raw and str(check_out_raw).strip() not in ("", "null", "None"):
#         new_check_out = strip_tz(parse_iso(str(check_out_raw)))
#         if new_check_out:
#             record.check_out = new_check_out
#             record.status    = "completed"
#         else:
#             record.check_out = None
#             record.status    = "ongoing"
#     else:
#         record.check_out = None
#         record.status    = "ongoing"

#     if record.check_in and record.check_out:
#         record.hours_worked = safe_hours(
#             record.check_in, record.check_out, record.total_break_minutes or 0
#         )
#     else:
#         record.hours_worked = 0.0

#     db.add(AttendanceLog(
#         employee_id=record.employee_id,
#         type="MANUAL_EDIT",
#         timestamp=datetime.now(),
#         source="ADMIN_PANEL",
#     ))
#     db.commit()
#     return {"message": "Updated successfully", "id": record.id}


# # ---------------------------------------------------------------------------
# # DELETE /{attendance_id}
# # ---------------------------------------------------------------------------

# @router.delete("/{attendance_id}")
# async def delete_attendance(
#     attendance_id: int,
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin"]))
# ):
#     record = db.query(Attendance).filter(Attendance.id == attendance_id).first()
#     if not record:
#         raise HTTPException(status_code=404, detail="Record not found")
#     db.delete(record)
#     db.commit()
#     return {"message": "Deleted successfully"}


# # ---------------------------------------------------------------------------
# # POST /mark-absents
# # ---------------------------------------------------------------------------

# @router.post("/mark-absents")
# def mark_absent_employees(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin"]))
# ):
#     now       = datetime.now()
#     employees = db.query(Employee).filter(Employee.is_active == True).all()
#     absent_count = 0

#     for emp in employees:
#         shift_time_str = emp.shift_start or "07:00"
#         try:
#             h, m = map(int, shift_time_str.split(":"))
#         except ValueError:
#             h, m = 7, 0

#         expected_start = now.replace(hour=h, minute=m, second=0, microsecond=0)
#         if expected_start > now:
#             expected_start -= timedelta(days=1)

#         if now <= (expected_start + timedelta(hours=1)):
#             continue 

#         window_start = expected_start - timedelta(hours=4)
#         window_end   = expected_start + timedelta(hours=16)

#         exists = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.check_in >= window_start,
#             Attendance.check_in <= window_end,
#         ).first()

#         if not exists:
#             db.add(Attendance(
#                 employee_id=emp.employee_id,
#                 user_id=emp.user_id,
#                 check_in=expected_start,
#                 status="Absent",
#                 hours_worked=0.0,
#                 shift_type=determine_shift_type(emp.shift_start),
#                 week_number=expected_start.isocalendar()[1],
#                 shift_start=emp.shift_start,
#                 shift_end=emp.shift_end,
#                 duty_hour=emp.duty_hour,
#             ))
#             absent_count += 1

#     db.commit()
#     return {"message": f"Scan complete. {absent_count} employees marked absent."}


# # ---------------------------------------------------------------------------
# # POST /auto-close-stale 
# # ---------------------------------------------------------------------------

# @router.post("/auto-close-stale")
# def auto_close_stale_shifts(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin"]))
# ):
#     now = datetime.now()
    
#     open_shifts = db.query(Attendance).options(joinedload(Attendance.employee_record)).filter(
#         Attendance.status.in_(["ongoing", "on_break"])
#     ).all()

#     closed_count = 0

#     for active in open_shifts:
#         if not active.check_in:
#             continue

#         emp = active.employee_record

#         try:
#             s_h, s_m = map(int, (active.shift_start or "08:00").split(":"))
#         except ValueError:
#             s_h, s_m = 8, 0

#         shift_start_dt = active.check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)

#         if active.check_in.hour >= 22 and s_h < 4:
#             shift_start_dt += timedelta(days=1)
#         elif active.check_in.hour <= 4 and s_h >= 22:
#             shift_start_dt -= timedelta(days=1)

#         # 20 hours for split, 16 hours for normal
#         penalty_hours = 20 if (emp and emp.has_split_shift) else 16
#         deadline = shift_start_dt + timedelta(hours=penalty_hours)

#         if now >= deadline:
#             active.status = "completed"
#             active.hours_worked = 0.0 
            
#             db.add(AttendanceLog(
#                 employee_id=active.employee_id,
#                 type="SYSTEM_AUTO_CLOSE",
#                 timestamp=now,
#                 source="SYSTEM_SWEEP"
#             ))
#             closed_count += 1

#     if closed_count > 0:
#         db.commit()
        
#     return {"message": f"Scan complete. {closed_count} abandoned shifts auto-closed with 0 hours."}







# from fastapi import APIRouter, Depends, HTTPException, Body
# from sqlalchemy import func
# from sqlalchemy.orm import Session, joinedload
# from datetime import datetime, timedelta, timezone
# from typing import Optional
# from app.core.database import get_db
# from app.core.auth import roles_required
# from app.models.attendance import Attendance, AttendanceLog
# from app.models.employee import Employee

# router = APIRouter()


# # ---------------------------------------------------------------------------
# # Helpers
# # ---------------------------------------------------------------------------

# def utcnow() -> datetime:
#     return datetime.now(timezone.utc)


# def calculate_hours(check_in: datetime, check_out: datetime) -> float:
#     """Decimal hours between two timestamps. Always >= 0."""
#     if not check_in or not check_out:
#         return 0.0
#     total_seconds = (check_out - check_in).total_seconds()
#     return max(0.0, round(total_seconds / 3600.0, 2))


# def safe_hours(check_in: datetime, check_out: datetime, break_minutes: float = 0.0) -> float:
#     return max(0.0, round(calculate_hours(check_in, check_out) - break_minutes / 60.0, 2))


# def parse_iso(dt_str: str) -> Optional[datetime]:
#     if not dt_str:
#         return None
#     try:
#         dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
#         if dt.tzinfo is None:
#             dt = dt.replace(tzinfo=timezone.utc)
#         return dt
#     except ValueError:
#         return None


# def strip_tz(dt: Optional[datetime]) -> Optional[datetime]:
#     """Remove timezone info for naive-datetime DB columns."""
#     if dt is None:
#         return None
#     return dt.replace(tzinfo=None) if dt.tzinfo else dt


# # ---------------------------------------------------------------------------
# # GET /stats
# # ---------------------------------------------------------------------------

# @router.get("/stats")
# def get_attendance_stats(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     total_employees = db.query(Employee).filter(Employee.is_active == True).count()

#     now_naive  = datetime.now()
#     time_limit = now_naive - timedelta(hours=24)
#     today_start = now_naive.replace(hour=0, minute=0, second=0, microsecond=0)

#     present_now = db.query(Attendance).filter(
#         Attendance.status.in_(["ongoing", "on_break"]),
#         Attendance.check_in >= time_limit
#     ).count()

#     # Absent records store the SCHEDULED shift start as check_in,
#     # so use today_start not time_limit to avoid miscounting yesterday's absents.
#     absent_count = db.query(Attendance).filter(
#         Attendance.status == "Absent",
#         Attendance.check_in >= today_start
#     ).count()

#     return {
#         "present_now":    present_now,
#         "absent":         absent_count,
#         "total_employees": total_employees,
#         "last_updated":   now_naive.isoformat(),
#     }


# # ---------------------------------------------------------------------------
# # GET /all  and  GET /summary  — split into two routes sharing one helper
# # (stacked-decorator bug fixed)
# # ---------------------------------------------------------------------------

# def _attendance_list(db: Session):
#     logs = (
#         db.query(Attendance)
#         .options(joinedload(Attendance.employee_record).joinedload(Employee.user))
#         .order_by(Attendance.check_in.desc())
#         .all()
#     )
#     results = []
#     for a in logs:
#         emp     = a.employee_record
#         s_start = getattr(a, "shift_start", None) or (getattr(emp, "shift_start", "08:00") if emp else "08:00")
#         s_end   = getattr(a, "shift_end",   None) or (getattr(emp, "shift_end",   "20:00") if emp else "20:00")
#         d_hour  = getattr(a, "duty_hour",   None) or (getattr(emp, "duty_hour",   12.0)    if emp else 12.0)
#         results.append({
#             "id":           a.id,
#             "employee_id":  a.employee_id,
#             "name":         emp.user.name if emp and emp.user else "Unknown",
#             "department":   emp.department if emp else "Main",
#             "shift_start":  s_start,
#             "shift_end":    s_end,
#             "duty_hour":    d_hour,
#             "check_in":     a.check_in.isoformat()  if a.check_in  else None,
#             "check_out":    a.check_out.isoformat() if a.check_out else None,
#             "hours_worked": a.hours_worked or 0.0,
#             "shift_type":   a.shift_type or ("Night" if a.check_in and a.check_in.hour >= 16 else "Day"),
#             "status":       a.status,
#             "date":         (a.check_in.date().isoformat() if a.check_in
#                              else (a.date.isoformat() if getattr(a, "date", None) else None)),
#         })
#     return results


# @router.get("/all")
# def get_attendance_all(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     return _attendance_list(db)


# @router.get("/summary")
# def get_attendance_summary(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     return _attendance_list(db)


# # ---------------------------------------------------------------------------
# # POST /sync-zk-log
# # ---------------------------------------------------------------------------

# @router.post("/sync-zk-log")
# async def sync_zk_log(
#     employee_id: str,
#     timestamp: str,
#     db: Session = Depends(get_db)
# ):
#     ts_dt = strip_tz(parse_iso(timestamp)) or datetime.now()

#     emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
#     if not emp or not emp.is_active:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     is_split_worker = emp.has_split_shift
#     lookback_window = 22.0 if is_split_worker else 18.0

#     # Double-tap protection
#     last_log = (
#         db.query(AttendanceLog)
#         .filter(AttendanceLog.employee_id == employee_id)
#         .order_by(AttendanceLog.timestamp.desc())
#         .first()
#     )
#     if last_log and (ts_dt - last_log.timestamp).total_seconds() < 3600:
#         return {"action": "ignored", "reason": "double_tap"}

#     # Find latest shift
#     latest_shift = (
#         db.query(Attendance)
#         .filter(Attendance.employee_id == employee_id)
#         .order_by(Attendance.check_in.desc())
#         .first()
#     )

#     active = None
#     if latest_shift:
#         hours_since = (ts_dt - latest_shift.check_in).total_seconds() / 3600
#         if hours_since <= lookback_window:
#             active = latest_shift
#         elif latest_shift.status in ["ongoing", "on_break"]:
#             latest_shift.status       = "completed"
#             latest_shift.hours_worked = latest_shift.duty_hour or emp.duty_hour or 12.0
#             db.commit()
#             active = None

#     punch_type = "IN" if not active or active.status == "Absent" else "OUT"
#     db.add(AttendanceLog(
#         employee_id=employee_id,
#         timestamp=ts_dt,
#         type=punch_type,
#         source="ZK_MACHINE",
#     ))

#     if not active or active.status == "Absent":
#         if active and active.status == "Absent":
#             active.check_in    = ts_dt
#             active.status      = "ongoing"
#             active.shift_start = emp.shift_start
#             active.shift_end   = emp.shift_end
#             active.duty_hour   = emp.duty_hour
#             db.commit()
#             return {"action": "absent_overwritten", "punch": 1}
#         else:
#             db.add(Attendance(
#                 employee_id=employee_id,
#                 user_id=emp.user_id,
#                 check_in=ts_dt,
#                 status="ongoing",
#                 week_number=ts_dt.isocalendar()[1],
#                 shift_start=emp.shift_start,
#                 shift_end=emp.shift_end,
#                 duty_hour=emp.duty_hour,
#             ))
#             db.commit()
#             return {"action": "check_in_recorded", "punch": 1}

#     total_span_hours = (ts_dt - active.check_in).total_seconds() / 3600

#     if not is_split_worker:
#         active.status       = "completed"
#         active.check_out    = ts_dt
#         active.hours_worked = max(0.0, round(total_span_hours, 2))
#         db.commit()
#         return {"action": "checkout_updated", "hours": active.hours_worked}

#     if active.status == "ongoing":
#         if not active.last_break_start:
#             active.status           = "on_break"
#             active.last_break_start = ts_dt
#             db.commit()
#             return {"action": "break_started", "punch": 2}
#         else:
#             active.status       = "completed"
#             active.check_out    = ts_dt
#             active.hours_worked = safe_hours(active.check_in, ts_dt, active.total_break_minutes or 0)
#             db.commit()
#             return {"action": "checkout_completed", "hours": active.hours_worked, "punch": 4}

#     elif active.status == "on_break":
#         active.status = "ongoing"
#         break_mins = (ts_dt - active.last_break_start).total_seconds() / 60
#         active.total_break_minutes = (active.total_break_minutes or 0) + break_mins
#         db.commit()
#         return {"action": "returned_from_break", "punch": 3}

#     elif active.status == "completed":
#         active.check_out    = ts_dt
#         active.hours_worked = safe_hours(active.check_in, ts_dt, active.total_break_minutes or 0)
#         db.commit()
#         return {"action": "checkout_extended", "hours": active.hours_worked}

#     return {"action": "no_change"}


# # ---------------------------------------------------------------------------
# # POST /manual  — create/upsert attendance manually
# # (split from stacked decorator; uses real employee shift, not hardcoded hours)
# # ---------------------------------------------------------------------------

# @router.post("/manual")
# async def add_manual_attendance(
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     emp = db.query(Employee).filter(Employee.employee_id == data.get("employee_id", "")).first()
#     if not emp:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     try:
#         check_in  = strip_tz(parse_iso(data.get("check_in")))
#         check_out = strip_tz(parse_iso(data.get("check_out")))
#     except (ValueError, AttributeError):
#         raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

#     if not check_in:
#         raise HTTPException(status_code=400, detail="check_in is required.")

#     # ── Use REAL employee shift schedule (not hardcoded) ──────────────────
#     try:
#         s_h, s_m = map(int, (emp.shift_start or "08:00").split(":"))
#         e_h, e_m = map(int, (emp.shift_end   or "20:00").split(":"))
#     except ValueError:
#         s_h, s_m, e_h, e_m = 8, 0, 20, 0

#     shift_start_dt = check_in.replace(hour=s_h, minute=s_m, second=0, microsecond=0)
#     is_late = check_in > (shift_start_dt + timedelta(minutes=15))

#     attendance_label = "Normal"
#     if check_out:
#         shift_end_dt = check_in.replace(hour=e_h, minute=e_m, second=0, microsecond=0)
#         if e_h < s_h:                        # overnight shift
#             shift_end_dt += timedelta(days=1)
#         # Only "Early Leave" if checkout is MORE than 10 min before shift end
#         if (shift_end_dt - check_out).total_seconds() / 60 > 10:
#             attendance_label = "Early Leave"

#     today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
#     today_end   = today_start + timedelta(days=1)
#     if check_in.hour >= 22 and s_h == 0:
#         today_start -= timedelta(days=1)
#         today_end   -= timedelta(days=1)

#     existing = db.query(Attendance).filter(
#         Attendance.employee_id == emp.employee_id,
#         Attendance.check_in >= today_start,
#         Attendance.check_in <  today_end,
#     ).first()

#     now = datetime.now()
#     if existing:
#         existing.check_in    = check_in
#         existing.check_out   = check_out
#         existing.status      = "completed" if check_out else "ongoing"
#         if existing.check_in and existing.check_out:
#             existing.hours_worked = safe_hours(
#                 existing.check_in, existing.check_out, existing.total_break_minutes or 0
#             )
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", timestamp=now, source="ADMIN"))
#         msg = "Attendance record updated"
#     else:
#         db.add(Attendance(
#             employee_id=emp.employee_id,
#             user_id=emp.user_id,
#             check_in=check_in,
#             check_out=check_out,
#             status="completed" if check_out else "ongoing",
#             hours_worked=safe_hours(check_in, check_out) if check_out else None,
#             shift_type="Night" if (check_in.hour >= 16 or check_in.hour < 4) else "Day",
#             week_number=check_in.isocalendar()[1],
#             shift_start=emp.shift_start,
#             shift_end=emp.shift_end,
#             duty_hour=emp.duty_hour,
#         ))
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", timestamp=now, source="ADMIN"))
#         msg = "New manual entry created"

#     db.commit()
#     return {"message": msg, "label_calculated": attendance_label, "is_late": is_late}


# # ---------------------------------------------------------------------------
# # PUT /attendance/{attendance_id}  — admin inline update
# # (split from stacked decorator)
# # ---------------------------------------------------------------------------

# @router.put("/attendance/{attendance_id}")
# async def update_attendance_by_id(
#     attendance_id: str,
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     emp = db.query(Employee).filter(Employee.employee_id == data.get("employee_id", "")).first()
#     if not emp:
#         raise HTTPException(status_code=404, detail="Employee not found")

#     check_in  = strip_tz(parse_iso(data.get("check_in")))
#     check_out = strip_tz(parse_iso(data.get("check_out")))

#     existing = None
#     if not attendance_id.startswith("temp-"):
#         try:
#             existing = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()
#         except (ValueError, TypeError):
#             raise HTTPException(status_code=400, detail="Invalid attendance ID")

#     if not existing and check_in:
#         today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
#         today_end   = today_start + timedelta(days=1)
#         existing = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.check_in >= today_start,
#             Attendance.check_in <  today_end,
#         ).first()

#     now = datetime.now()
#     if existing:
#         existing.check_in    = check_in or existing.check_in
#         existing.check_out   = check_out
#         existing.status      = "completed" if check_out else "ongoing"
#         if existing.check_in and existing.check_out:
#             existing.hours_worked = safe_hours(
#                 existing.check_in, existing.check_out, existing.total_break_minutes or 0
#             )
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", timestamp=now, source="ADMIN"))
#         msg = "Attendance record updated"
#     else:
#         db.add(Attendance(
#             employee_id=emp.employee_id,
#             user_id=emp.user_id,
#             check_in=check_in,
#             check_out=check_out,
#             status="completed" if check_out else "ongoing",
#             hours_worked=safe_hours(check_in, check_out) if check_out else None,
#             shift_type="Night" if check_in and (check_in.hour >= 16 or check_in.hour < 4) else "Day",
#             week_number=check_in.isocalendar()[1] if check_in else datetime.now().isocalendar()[1],
#             shift_start=emp.shift_start,
#             shift_end=emp.shift_end,
#             duty_hour=emp.duty_hour,
#         ))
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", timestamp=now, source="ADMIN"))
#         msg = "New record created"

#     db.commit()
#     return {"message": msg}


# # ---------------------------------------------------------------------------
# # PUT /{attendance_id}  — quick field edit from admin panel
# # ---------------------------------------------------------------------------

# @router.put("/{attendance_id}")
# async def update_attendance(
#     attendance_id: str,
#     data: dict = Body(...),
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin", "auditor"]))
# ):
#     record = None

#     if attendance_id.startswith("temp-"):
#         emp_id = data.get("employee_id")
#         if not emp_id:
#             raise HTTPException(status_code=400, detail="employee_id required for temporary records")
#         check_in_dt = strip_tz(parse_iso(data.get("check_in")))
#         if check_in_dt:
#             try:
#                 record = db.query(Attendance).filter(
#                     Attendance.employee_id == emp_id,
#                     func.date(Attendance.check_in) == check_in_dt.date()
#                 ).first()
#             except (ValueError, AttributeError) as e:
#                 raise HTTPException(status_code=400, detail=f"Invalid check_in date: {e}")
#     else:
#         try:
#             record = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()
#         except (ValueError, TypeError):
#             raise HTTPException(status_code=400, detail="Invalid attendance ID")

#     if not record:
#         raise HTTPException(status_code=404, detail="Attendance record not found")

#     new_check_in = strip_tz(parse_iso(data.get("check_in")))
#     if new_check_in:
#         record.check_in = new_check_in

#     check_out_raw = data.get("check_out")
#     if check_out_raw and str(check_out_raw).strip() not in ("", "null", "None"):
#         new_check_out = strip_tz(parse_iso(str(check_out_raw)))
#         if new_check_out:
#             record.check_out = new_check_out
#             record.status    = "completed"
#         else:
#             record.check_out = None
#             record.status    = "ongoing"
#     else:
#         record.check_out = None
#         record.status    = "ongoing"

#     if record.check_in and record.check_out:
#         record.hours_worked = safe_hours(
#             record.check_in, record.check_out, record.total_break_minutes or 0
#         )
#     else:
#         record.hours_worked = 0.0

#     db.add(AttendanceLog(
#         employee_id=record.employee_id,
#         type="MANUAL_EDIT",
#         timestamp=datetime.now(),
#         source="ADMIN_PANEL",
#     ))
#     db.commit()
#     return {"message": "Updated successfully", "id": record.id}


# # ---------------------------------------------------------------------------
# # DELETE /{attendance_id}
# # ---------------------------------------------------------------------------

# @router.delete("/{attendance_id}")
# async def delete_attendance(
#     attendance_id: int,
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin"]))
# ):
#     record = db.query(Attendance).filter(Attendance.id == attendance_id).first()
#     if not record:
#         raise HTTPException(status_code=404, detail="Record not found")
#     db.delete(record)
#     db.commit()
#     return {"message": "Deleted successfully"}


# # ---------------------------------------------------------------------------
# # POST /mark-absents  — admin only (was completely unprotected before)
# # ---------------------------------------------------------------------------

# @router.post("/mark-absents")
# def mark_absent_employees(
#     db: Session = Depends(get_db),
#     current_user=Depends(roles_required(["admin"]))
# ):
#     now       = datetime.now()
#     employees = db.query(Employee).filter(Employee.is_active == True).all()
#     absent_count = 0

#     for emp in employees:
#         shift_time_str = emp.shift_start or "07:00"
#         try:
#             h, m = map(int, shift_time_str.split(":"))
#         except ValueError:
#             h, m = 7, 0

#         expected_start = now.replace(hour=h, minute=m, second=0, microsecond=0)
#         if expected_start > now:
#             expected_start -= timedelta(days=1)

#         if now <= (expected_start + timedelta(hours=1)):
#             continue  # Too early to mark absent

#         window_start = expected_start - timedelta(hours=4)
#         window_end   = expected_start + timedelta(hours=16)

#         exists = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.check_in >= window_start,
#             Attendance.check_in <= window_end,
#         ).first()

#         if not exists:
#             db.add(Attendance(
#                 employee_id=emp.employee_id,
#                 user_id=emp.user_id,
#                 check_in=expected_start,
#                 status="Absent",
#                 hours_worked=0.0,
#                 shift_type="Day" if h < 16 else "Night",
#                 week_number=expected_start.isocalendar()[1],
#                 shift_start=emp.shift_start,
#                 shift_end=emp.shift_end,
#                 duty_hour=emp.duty_hour,
#             ))
#             absent_count += 1

#     db.commit()
#     return {"message": f"Scan complete. {absent_count} employees marked absent."}











# from fastapi import APIRouter, Depends, HTTPException, status, Body
# from sqlalchemy import Date, cast, extract, func
# from sqlalchemy.orm import Session, joinedload
# from datetime import date as dt_date, datetime, timedelta
# from typing import List, Optional
# from app.core.database import get_db
# from app.core.auth import roles_required 
# from app.models.attendance import Attendance, AttendanceLog
# from app.models.employee import Employee
# from app.models.user import User
# from datetime import datetime, timezone

# router = APIRouter()

# def calculate_hours(check_in: datetime, check_out: datetime) -> float:
#     """Calculates decimal hours between two timestamps, handling midnight spans."""
#     if not check_in or not check_out:
#         return 0.0
    
#     delta = check_out - check_in
#     total_seconds = delta.total_seconds()
    
#     if total_seconds < 0:
#         return 0.0
        
#     # Convert to decimal (e.g., 8h 30m -> 8.5)
#     return round(total_seconds / 3600.0, 2)


# def utcnow() -> datetime:
#     """Return a timezone-aware UTC datetime."""
#     return datetime.now(timezone.utc)

# def parse_iso(dt_str: str) -> datetime | None:
#     """Parse an ISO-8601 string (with optional trailing Z) to a UTC-aware datetime."""
#     if not dt_str:
#         return None
#     try:
#         dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
#         # Ensure timezone-aware
#         if dt.tzinfo is None:
#             dt = dt.replace(tzinfo=timezone.utc)
#         return dt
#     except ValueError:
#         return None

# @router.get("/stats")
# def get_attendance_stats(
#     db: Session = Depends(get_db), 
#     current_user = Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     total_employees = db.query(Employee).filter(Employee.is_active == True).count()
    
#     # Time limit: Only look at shifts from the last 24 hours
#     time_limit = datetime.now() - timedelta(hours=24)
    
#     # 1. Present Now: Ongoing or On Break shifts from the last 24 hours
#     present_now = db.query(Attendance).filter(
#         Attendance.status.in_(["ongoing", "on_break"]),
#         Attendance.check_in >= time_limit
#     ).count()
    
#     # 2. Absent Today: Specifically count "Absent" records from the last 24 hours
#     absent_count = db.query(Attendance).filter(
#         Attendance.status == "Absent",
#         Attendance.check_in >= time_limit
#     ).count()

#     return {
#         "present_now": present_now,
#         "absent": absent_count,
#         "total_employees": total_employees,
#         "last_updated": datetime.now().isoformat()
#     }




# @router.get("/all")
# @router.get("/summary")
# def get_attendance_data(
#     db: Session = Depends(get_db), 
#     current_user = Depends(roles_required(["admin", "read_only_admin", "auditor"]))
# ):
#     logs = db.query(Attendance).options(
#         joinedload(Attendance.employee_record).joinedload(Employee.user)
#     ).order_by(Attendance.check_in.desc()).all()

#     results = []
#     for a in logs:
#         emp = a.employee_record
        
#         # Look at the Attendance log (a) first. If it has a frozen shift_start, use it!
#         # If it doesn't (old data), fallback to the Employee profile (emp).
#         s_start = getattr(a, 'shift_start', None) or (getattr(emp, 'shift_start', "08:00") if emp else "08:00")
#         s_end = getattr(a, 'shift_end', None) or (getattr(emp, 'shift_end', "20:00") if emp else "20:00")
        
#         # Adding duty_hour as well so the frontend math is always accurate
#         d_hour = getattr(a, 'duty_hour', None) or (getattr(emp, 'duty_hour', 12.0) if emp else 12.0)

#         results.append({
#             "id": a.id,
#             "employee_id": a.employee_id,
#             "name": emp.user.name if emp and emp.user else "Unknown",
#             "department": emp.department if emp else "Main",
            
#             # Using the safely extracted variables from above
#             "shift_start": s_start, 
#             "shift_end": s_end,
#             "duty_hour": d_hour,
            
#             "check_in": a.check_in.isoformat() if a.check_in else None,
#             "check_out": a.check_out.isoformat() if a.check_out else None,
#             "hours_worked": a.hours_worked or 0.0,
#             "shift_type": a.shift_type or ("Night" if a.check_in and a.check_in.hour >= 16 else "Day"),
#             "status": a.status,
#             "date": a.check_in.date().isoformat() if a.check_in else (a.date.isoformat() if hasattr(a, 'date') and a.date else None)
#         })
#     return results




# @router.post("/sync-zk-log")
# async def sync_zk_log(
#     employee_id: str,
#     timestamp: str,
#     db: Session = Depends(get_db)
# ):
#     # --- 0. PARSE TIMESTAMP (UTC Aware) ---
#     ts_dt = parse_iso(timestamp) or utcnow()
#     ts_dt = ts_dt.replace(tzinfo=None)

#     # --- 1. VERIFY EMPLOYEE ---
#     emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
#     if not emp or not emp.is_active:
#         raise HTTPException(status_code=404, detail="Employee not found")
    
#     is_split_worker = emp.has_split_shift

#     # --- 2. DOUBLE TAP PROTECTION (1 Hour) ---
#     last_log = db.query(AttendanceLog).filter(
#         AttendanceLog.employee_id == employee_id
#     ).order_by(AttendanceLog.timestamp.desc()).first()

#     if last_log and (ts_dt - last_log.timestamp).total_seconds() < 3600:
#         return {"action": "ignored", "reason": "double_tap"}

#     # --- 3. FIND LATEST SHIFT ---
#     # Split shifts are long (e.g., 3:30 AM to 10 PM is 18.5 hours). 
#     # We use a 22-hour window for split workers to prevent accidental auto-close.
#     lookback_window = 22.0 if is_split_worker else 18.0
    
#     latest_shift = db.query(Attendance).filter(
#         Attendance.employee_id == employee_id
#     ).order_by(Attendance.check_in.desc()).first()

#     active = None
#     if latest_shift:
#         hours_since_checkin = (ts_dt - latest_shift.check_in).total_seconds() / 3600
        
#         if hours_since_checkin <= lookback_window:
#             active = latest_shift
#         elif latest_shift.status in ["ongoing", "on_break"]:
#             # AUTO-CLOSE: If they forgot to punch out yesterday
#             latest_shift.status = "completed"
#             latest_shift.hours_worked = latest_shift.duty_hour or emp.duty_hour or 12.0 
#             db.commit()
#             active = None

#     # --- 4. RECORD RAW PUNCH ---
#     punch_type = "IN" if not active or active.status == "Absent" else "OUT"
#     db.add(AttendanceLog(
#         employee_id=employee_id,
#         timestamp=ts_dt,
#         type=punch_type,
#         source="ZK_MACHINE"
#     ))

#     # --- 5. NEW CHECK-IN (Punch 1) ---
#     if not active or active.status == "Absent":
#         if active and active.status == "Absent":
#             # Overwrite today's absent record
#             active.check_in = ts_dt
#             active.status = "ongoing"
#             active.shift_start, active.shift_end, active.duty_hour = emp.shift_start, emp.shift_end, emp.duty_hour
#             db.commit()
#             return {"action": "absent_overwritten", "punch": 1}
#         else:
#             # Create fresh record
#             entry = Attendance(
#                 employee_id=employee_id, user_id=emp.user_id,
#                 check_in=ts_dt, status="ongoing",
#                 week_number=ts_dt.isocalendar()[1],
#                 shift_start=emp.shift_start, shift_end=emp.shift_end, duty_hour=emp.duty_hour
#             )
#             db.add(entry)
#             db.commit()
#             return {"action": "check_in_recorded", "punch": 1}

#     # --- 6. CALCULATIONS ---
#     total_span_hours = (ts_dt - active.check_in).total_seconds() / 3600

#     # --- 7. HANDLE SUBSEQUENT PUNCHES ---
    
#     # [A] STANDARD WORKER (Simple In/Out)
#     if not is_split_worker:
#         active.status = "completed"
#         active.check_out = ts_dt
#         active.hours_worked = round(total_span_hours, 2)
#         db.commit()
#         return {"action": "checkout_updated", "hours": active.hours_worked}

#     # [B] SPLIT-SHIFT WORKER (The 4-Punch Logic)
#     else:
#         if active.status == "ongoing":
#             if not active.last_break_start:
#                 # PUNCH 2: Leaving for the long break (e.g., 12:00 PM)
#                 active.status = "on_break"
#                 active.last_break_start = ts_dt
#                 db.commit()
#                 return {"action": "break_started", "punch": 2}
#             else:
#                 # PUNCH 4: Final Checkout (e.g., 10:00 PM)
#                 active.status = "completed"
#                 active.check_out = ts_dt
#                 # Math: (Total Span) - (Total Break Time)
#                 break_hours = (active.total_break_minutes or 0) / 60
#                 active.hours_worked = round(total_span_hours - break_hours, 2)
#                 db.commit()
#                 return {"action": "checkout_completed", "hours": active.hours_worked, "punch": 4}
                
#         elif active.status == "on_break":
#             # PUNCH 3: Returning from the long break (e.g., 6:30 PM)
#             active.status = "ongoing"
#             active.last_break_end = ts_dt # We now have this column!
            
#             # Calculate how long they were actually on break
#             break_mins = (ts_dt - active.last_break_start).total_seconds() / 60
#             active.total_break_minutes = (active.total_break_minutes or 0) + break_mins
#             db.commit()
#             return {"action": "returned_from_break", "punch": 3}
            
#         elif active.status == "completed":
#             # PUNCH 5+: Just update the final checkout if they tap again
#             active.check_out = ts_dt
#             break_hours = (active.total_break_minutes or 0) / 60
#             active.hours_worked = round(total_span_hours - break_hours, 2)
#             db.commit()
#             return {"action": "checkout_extended", "hours": active.hours_worked}

#     return {"action": "no_change"}







# # # --- 4. MANUAL CORRECTIONS & CRUD ---

# @router.post("/manual")
# @router.put("/attendance/{attendance_id}")
# async def add_or_update_manual_attendance(
#     attendance_id: str = None, 
#     data: dict = Body(...), 
#     db: Session = Depends(get_db), 
#     current_user = Depends(roles_required(["admin", "auditor"]))
# ):
#     # 1. Identify the Employee
#     emp = db.query(Employee).filter(Employee.employee_id == data["employee_id"]).first()
#     if not emp: 
#         raise HTTPException(status_code=404, detail="Employee not found")

#     # --- SHIFT SCHEDULE LOOKUP ---
#     # Fetch from database. Mocking for the 12 AM - 12 PM shift.
#     scheduled_start_hour = 0
#     scheduled_end_hour = 12

#     # 2. Parse timestamps correctly (Handling 'Z' for UTC)
#     try:
#         def parse_dt(dt_str):
#             if not dt_str: return None
#             return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))

#         check_in = parse_dt(data.get("check_in"))
#         check_out = parse_dt(data.get("check_out"))
#     except ValueError:
#         raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

#     # 3. UPSERT LOGIC
#     existing_rec = None
#     if attendance_id and not attendance_id.startswith("temp-"):
#         existing_rec = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    
#     if not existing_rec and check_in:
#         # Fallback: Look for an existing "Absent" record or current day record to overwrite
#         today_start = check_in.replace(hour=0, minute=0, second=0, microsecond=0)
#         today_end = today_start + timedelta(days=1)
        
#         # Account for night shift check-ins the night before
#         if check_in.hour >= 22 and scheduled_start_hour == 0:
#             today_start -= timedelta(days=1)
#             today_end -= timedelta(days=1)

#         existing_rec = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.check_in >= today_start,
#             Attendance.check_in < today_end
#         ).first()

#     # --- CALCULATE LABELS AND EFFECTIVE DATES ---
#     is_late = False
#     attendance_label = "Normal"
    
#     if check_in:
#         # Late Check
#         shift_start_time = check_in.replace(hour=scheduled_start_hour, minute=0, second=0)
#         if check_in > (shift_start_time + timedelta(minutes=15)):
#             is_late = True
            
#     if check_in and check_out:
#         # Early Leave Check
#         shift_end_time = check_in.replace(hour=scheduled_end_hour, minute=0, second=0)
#         if scheduled_end_hour < scheduled_start_hour:
#             shift_end_time += timedelta(days=1)

#         if check_out < shift_end_time:
#             attendance_label = "Early Leave"

#     # --- APPLY UPDATES ---
#     if existing_rec:
#         # UPDATE existing
#         existing_rec.check_in = check_in or existing_rec.check_in
#         existing_rec.check_out = check_out
#         existing_rec.status = "completed" if check_out else "ongoing"
        
#         # Recalculate hours considering break minutes
#         if existing_rec.check_in and existing_rec.check_out:
#             span_hours = (existing_rec.check_out - existing_rec.check_in).total_seconds() / 3600
#             break_hours = (existing_rec.total_break_minutes or 0) / 60
#             existing_rec.hours_worked = round(span_hours - break_hours, 2)
#             # existing_rec.leave_status = attendance_label
        
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_UPDATE", source="ADMIN"))
#         msg = "Attendance record updated"
    
#     else:
#         # CREATE new record
#         span_hours = (check_out - check_in).total_seconds() / 3600 if check_out else 0
        
#         new_rec = Attendance(
#             employee_id=emp.employee_id,
#             user_id=emp.user_id,
#             check_in=check_in,
#             check_out=check_out,
#             status="completed" if check_out else "ongoing",
#             hours_worked=round(span_hours, 2) if check_out else None,
#             shift_type="Night" if check_in and (check_in.hour >= 16 or check_in.hour < 4) else "Day",
#             week_number=check_in.isocalendar()[1] if check_in else datetime.now().isocalendar()[1]
#             # arrival_status="Late Arrival" if is_late else "Normal",
#             # leave_status=attendance_label
#         )
#         db.add(new_rec)
#         db.add(AttendanceLog(employee_id=emp.employee_id, type="MANUAL_CREATE", source="ADMIN"))
#         msg = "New manual entry created"

#     db.commit()
#     return {"message": msg, "label_calculated": attendance_label, "is_late": is_late}





# @router.put("/{attendance_id}")
# async def update_attendance(
#     attendance_id: str, # Change to str to support 'temp-xxx' IDs
#     data: dict, 
#     db: Session = Depends(get_db), 
#     current_user = Depends(roles_required(["admin", "auditor"]))
# ):
#     # 1. Handle Temporary IDs (temp-13, etc.)
#     # If the ID is temporary, we can't find it by ID. 
#     # We must find the record by employee_id and check_in date.
#     record = None
    
#     if attendance_id.startswith("temp-"):
#         emp_id = data.get("employee_id")
#         if not emp_id:
#             raise HTTPException(status_code=400, detail="Employee ID required for new records")
            
#         # Try to find an existing record for this employee today (e.g., an 'Absent' record)
#         # Assuming your data["check_in"] is the reference date
#         try:
#             target_date = datetime.fromisoformat(data["check_in"].replace('Z', '+00:00')).date()
#             record = db.query(Attendance).filter(
#                 Attendance.employee_id == emp_id,
#                 func.date(Attendance.check_in) == target_date
#             ).first()
#         except:
#             pass
#     else:
#         # It's a real database ID
#         record = db.query(Attendance).filter(Attendance.id == int(attendance_id)).first()

#     if not record:
#         raise HTTPException(status_code=404, detail="Attendance record not found")

#     # 2. Update Check-In
#     if data.get("check_in"):
#         try:
#             # Use +00:00 instead of empty string to maintain timezone awareness
#             record.check_in = datetime.fromisoformat(data["check_in"].replace('Z', '+00:00'))
#         except ValueError:
#             raise HTTPException(status_code=400, detail="Invalid check_in format")

#     # 3. Update Check-Out & Status
#     check_out_val = data.get("check_out")
#     if check_out_val and str(check_out_val).strip() not in ["", "null", "None"]:
#         try:
#             record.check_out = datetime.fromisoformat(str(check_out_val).replace('Z', '+00:00'))
#             record.status = "completed"
#         except ValueError:
#             record.check_out = None
#             record.status = "ongoing"
#     else:
#         record.check_out = None
#         record.status = "ongoing"

# # 4. Recalculate Hours (Protecting Split-Shift Breaks!)
#     if record.check_in and record.check_out:
#         span_hours = calculate_hours(record.check_in, record.check_out)
        
#         # Subtract their break time if they are a split-shift worker
#         break_hours = (record.total_break_minutes or 0) / 60.0
        
#         record.hours_worked = round(span_hours - break_hours, 2)
#     else:
#         record.hours_worked = 0.0

#     # 5. Log the Manual Edit
#     db.add(AttendanceLog(
#         employee_id=record.employee_id, 
#         type="MANUAL_EDIT", 
#         timestamp=datetime.now(),
#         source="ADMIN_PANEL"
#     ))

#     db.commit()
#     return {"message": "Updated successfully", "id": record.id}





# @router.delete("/{attendance_id}")
# async def delete_attendance(attendance_id: int, db: Session = Depends(get_db), current_user = Depends(roles_required(["admin"]))):
#     record = db.query(Attendance).filter(Attendance.id == attendance_id).first()
#     if not record: raise HTTPException(status_code=404, detail="Record not found")
#     db.delete(record)
#     db.commit()
#     return {"message": "Deleted successfully"}






# @router.post("/mark-absents")
# def mark_absent_employees(db: Session = Depends(get_db)):
#     now = datetime.now()
#     employees = db.query(Employee).filter(Employee.is_active == True).all()
    
#     absent_count = 0
#     for emp in employees:
#         shift_time_str = emp.shift_start or "07:00" # Default to 7am
#         h, m = map(int, shift_time_str.split(':'))
        
#         # 1. Find the exact datetime of their MOST RECENT scheduled shift
#         expected_start = now.replace(hour=h, minute=m, second=0, microsecond=0)
        
#         # If today's shift time hasn't happened yet (e.g., it's 2 PM, shift is 8 PM),
#         # we need to be evaluating yesterday's shift.
#         if expected_start > now:
#             expected_start -= timedelta(days=1)
        
#         # 2. If current time is 1 hour past their expected start
#         if now > (expected_start + timedelta(hours=1)):
            
#             # --- PROBLEM 2 FIX: THE NIGHT SHIFT WINDOW ---
#             # Instead of checking calendar dates, we check if they clocked in 
#             # anytime between 4 hours BEFORE the shift, and 16 hours AFTER the shift.
#             window_start = expected_start - timedelta(hours=4)
#             window_end = expected_start + timedelta(hours=16)
            
#             exists = db.query(Attendance).filter(
#                 Attendance.employee_id == emp.employee_id,
#                 Attendance.check_in >= window_start,
#                 Attendance.check_in <= window_end
#             ).first()
            
#             if not exists:
#                 absent_entry = Attendance(
#                     employee_id=emp.employee_id,
#                     user_id=emp.user_id,
#                     check_in=expected_start, # Set check-in to exactly when they should have arrived
#                     status="Absent", 
#                     hours_worked=0.0,
#                     shift_type="Day" if h < 16 else "Night",
#                     week_number=expected_start.isocalendar()[1],
                    
#                     # --- PROBLEM 1 FIX: FREEZE HISTORICAL DATA ---
#                     # Prevents the frontend from breaking if you change their profile later
#                     shift_start=emp.shift_start,
#                     shift_end=emp.shift_end,
#                     duty_hour=emp.duty_hour
#                 )
#                 db.add(absent_entry)
#                 absent_count += 1
    
#     db.commit()
#     return {"message": f"Scan complete. {absent_count} employees marked absent."}