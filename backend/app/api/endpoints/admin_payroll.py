import csv
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from typing import List
from datetime import datetime
from app.core.database import get_db
from app.core.auth import roles_required
from app.models.employee import Employee
from app.models.attendance import Attendance
from app.models.payroll import MonthlyPayroll
from app.schemas.payroll import PayrollResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(value, default=0.0) -> float:
    """Safely coerce any value (string with currency symbols, None, etc.) to float."""
    if value is None:
        return default
    try:
        return float(str(value).replace("SAR", "").replace(",", "").strip())
    except (ValueError, TypeError):
        return default


def _calc_payroll_for_employee(emp: Employee, month: int, year: int, db: Session) -> dict:
    """
    Core payroll calculation for a single employee.
    Returns a plain dict matching PayrollResponse fields + extras needed by PDF.
    """
    # ── 1. Pull attendance records for this employee / month / year ──────────
    attendance_rows = db.query(Attendance).filter(
        Attendance.employee_id == emp.employee_id,
        extract("month", Attendance.check_in) == month,
        extract("year",  Attendance.check_in) == year,
        Attendance.status != "Absent",          # exclude absent placeholders
    ).all()

    # ── 2. Actual hours (sum of hours_worked from Attendance table) ──────────
    actual_hours = sum(
        _safe_float(a.hours_worked) for a in attendance_rows if a.hours_worked
    )

    # ── 3. Late / Early Leave counts ─────────────────────────────────────────
    late_count        = 0
    early_leave_count = 0
    for a in attendance_rows:
        if a.check_in and a.shift_start:
            try:
                sh, sm = map(int, a.shift_start.split(":"))
                shift_start_dt = a.check_in.replace(hour=sh, minute=sm, second=0, microsecond=0)
                if (a.check_in - shift_start_dt).total_seconds() / 60 > 15:
                    late_count += 1
            except Exception:
                pass
        if a.check_out and a.shift_end:
            try:
                eh, em = map(int, a.shift_end.split(":"))
                shift_end_dt = a.check_out.replace(hour=eh, minute=em, second=0, microsecond=0)
                # Overnight shift
                if shift_end_dt < a.check_out.replace(hour=0, minute=0):
                    from datetime import timedelta
                    shift_end_dt += timedelta(days=1)
                if (shift_end_dt - a.check_out).total_seconds() / 60 > 10:
                    early_leave_count += 1
            except Exception:
                pass

    # ── 4. Benefit hours (monthly_paid_leave field on Employee) ─────────────
    benefit_hours = _safe_float(getattr(emp, "monthly_paid_leave", 0.0))

    # ── 5. Duty hours per day ────────────────────────────────────────────────
    duty_hour = _safe_float(getattr(emp, "duty_hour", 0.0))

    # ── 6. Penalty deduction ─────────────────────────────────────────────────
    # Rule: first 4 infractions are grace, then every 3 extra = 1 deducted day
    total_infractions  = late_count + early_leave_count
    penalty_triggers   = max(0, total_infractions - 4)
    deducted_days      = penalty_triggers // 3
    penalty_hours      = deducted_days * duty_hour

    # ── 7. Final billable hours ───────────────────────────────────────────────
    final_billable = max(0.0, (actual_hours + benefit_hours) - penalty_hours)

    # ── 8. Salary & rates ────────────────────────────────────────────────────
    base_salary = _safe_float(
        getattr(emp, "salary_amount", getattr(emp, "salary", 0.0))
    )

    # Standard monthly hours = duty_hour × 26 working days
    standard_monthly_hours = duty_hour * 26
    hourly_rate = round(base_salary / standard_monthly_hours, 4) if standard_monthly_hours > 0 else 0.0

    gross_salary = round(final_billable * hourly_rate, 2)

    return {
        "employee_id":            emp.employee_id,
        "name":                   emp.user.name if emp.user else "Unknown",
        "month":                  month,
        "year":                   year,
        "total_actual_hours":     round(actual_hours, 2),
        "total_benefit_hours":    round(benefit_hours, 2),
        "total_paid_leave_hours": round(benefit_hours, 2),   # alias kept for schema compat
        "penalty_deduction_hours": round(penalty_hours, 2),
        "final_billable_hours":   round(final_billable, 2),
        "hourly_rate_at_time":    hourly_rate,
        "base_salary":            round(base_salary, 2),
        "gross_salary":           gross_salary,
        "net_salary":             gross_salary,              # adjustments applied later via PUT
        "late_count":             late_count,
        "early_leave_count":      early_leave_count,
        "duty_hour":              duty_hour,
        "standard_monthly_hours": standard_monthly_hours,
        "food_allowance":         0.0,
        "other_allowance":        0.0,
        "bonus":                  0.0,
        "deduction":              0.0,
        "status":                 "Warning" if deducted_days > 0 else "Good",
    }


# ---------------------------------------------------------------------------
# GET /calculate-batch/{month}/{year}
# Live preview — does NOT write to DB
# ---------------------------------------------------------------------------

@router.get("/calculate-batch/{month}/{year}", response_model=List[PayrollResponse])
def calculate_batch_preview(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    results = []

    for emp in employees:
        calc = _calc_payroll_for_employee(emp, month, year, db)

        # If a locked payroll exists for this month, overlay the saved adjustments
        locked = db.query(MonthlyPayroll).filter(
            MonthlyPayroll.employee_id == emp.employee_id,
            MonthlyPayroll.month == month,
            MonthlyPayroll.year  == year,
        ).first()

        if locked:
            calc["food_allowance"]   = locked.food_allowance   or 0.0
            calc["other_allowance"]  = locked.other_allowance  or 0.0
            calc["bonus"]            = locked.bonus             or 0.0
            calc["deduction"]        = locked.deduction         or 0.0
            calc["net_salary"]       = locked.net_salary        or calc["gross_salary"]
            calc["status"]           = locked.status

        results.append(calc)

    return results


# ---------------------------------------------------------------------------
# POST /generate-batch/{month}/{year}
# Lock & Finalize — UPSERT so re-running is safe
# ---------------------------------------------------------------------------

@router.post("/generate-batch/{month}/{year}")
def lock_and_save_payroll(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin"]))
):
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    saved = 0
    updated = 0

    for emp in employees:
        calc = _calc_payroll_for_employee(emp, month, year, db)

        existing = db.query(MonthlyPayroll).filter(
            MonthlyPayroll.employee_id == emp.employee_id,
            MonthlyPayroll.month == month,
            MonthlyPayroll.year  == year,
        ).first()

        if existing:
            # UPDATE — recalculate hours/salary but preserve manual adjustments
            existing.total_actual_hours     = calc["total_actual_hours"]
            existing.total_benefit_hours    = calc["total_benefit_hours"]
            existing.penalty_deduction_hours = calc["penalty_deduction_hours"]
            existing.final_billable_hours   = calc["final_billable_hours"]
            existing.hourly_rate_at_time    = calc["hourly_rate_at_time"]
            existing.base_salary            = calc["base_salary"]
            existing.gross_salary           = calc["gross_salary"]
            # Recalculate net with preserved adjustments
            existing.net_salary = (
                calc["gross_salary"]
                + (existing.food_allowance  or 0.0)
                + (existing.other_allowance or 0.0)
                + (existing.bonus           or 0.0)
                - (existing.deduction       or 0.0)
            )
            existing.late_count        = calc["late_count"]
            existing.early_leave_count = calc["early_leave_count"]
            existing.status            = "locked"
            updated += 1
        else:
            # INSERT
            new_record = MonthlyPayroll(
                employee_id              = calc["employee_id"],
                month                    = month,
                year                     = year,
                total_actual_hours       = calc["total_actual_hours"],
                total_benefit_hours      = calc["total_benefit_hours"],
                penalty_deduction_hours  = calc["penalty_deduction_hours"],
                final_billable_hours     = calc["final_billable_hours"],
                hourly_rate_at_time      = calc["hourly_rate_at_time"],
                base_salary              = calc["base_salary"],
                gross_salary             = calc["gross_salary"],
                net_salary               = calc["gross_salary"],
                late_count               = calc["late_count"],
                early_leave_count        = calc["early_leave_count"],
                food_allowance           = 0.0,
                other_allowance          = 0.0,
                bonus                    = 0.0,
                deduction                = 0.0,
                status                   = "locked",
            )
            db.add(new_record)
            saved += 1

    try:
        db.commit()
        return {
            "status":  "success",
            "message": f"Payroll for {month}/{year} locked. {saved} created, {updated} updated.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save payroll: {str(e)}")


# ---------------------------------------------------------------------------
# GET /summary  — lightweight card view (current month)
# ---------------------------------------------------------------------------

@router.get("/summary")
def get_payroll_summary(
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    now = datetime.now()
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    report = []

    for emp in employees:
        # Total actual hours from Attendance (excludes absents)
        total_hours = db.query(func.sum(Attendance.hours_worked)).filter(
            Attendance.employee_id == emp.employee_id,
            Attendance.status != "Absent",
            extract("month", Attendance.check_in) == now.month,
            extract("year",  Attendance.check_in) == now.year,
        ).scalar() or 0.0

        duty_hour             = _safe_float(getattr(emp, "duty_hour", 0.0))
        standard_monthly_hours = duty_hour * 26

        report.append({
            "name":              emp.user.name if emp.user else "Unknown",
            "employee_id":       emp.employee_id,
            "total_hours":       round(float(total_hours), 2),
            "standard_hours":    standard_monthly_hours,
            "progress":          min(round((float(total_hours) / standard_monthly_hours) * 100, 1), 100)
                                 if standard_monthly_hours > 0 else 0,
            "category":          "Full" if float(total_hours) >= standard_monthly_hours
                                 else "Partial",
        })

    return report


# ---------------------------------------------------------------------------
# GET /export-csv  — columns per spec
# Columns: Employee ID, Name, Total Verified Hours, Monthly Paid Leave (h),
#          Standard Working Hours/Month, Salary Amount
# ---------------------------------------------------------------------------

@router.get("/export-csv")
def export_payroll_csv(
    month: int = None,
    year:  int = None,
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    now = datetime.now()
    month = month or now.month
    year  = year  or now.year

    employees = db.query(Employee).filter(Employee.is_active == True).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Employee ID",
        "Name",
        "Total Verified Working Hours",
        "Monthly Paid Leave (Hours)",
        "Standard Working Hours / Month",
        "Salary Amount (SAR)",
    ])

    for emp in employees:
        # Actual hours from Attendance
        actual_hours = db.query(func.sum(Attendance.hours_worked)).filter(
            Attendance.employee_id == emp.employee_id,
            Attendance.status != "Absent",
            extract("month", Attendance.check_in) == month,
            extract("year",  Attendance.check_in) == year,
        ).scalar() or 0.0

        paid_leave_hours       = _safe_float(getattr(emp, "monthly_paid_leave", 0.0))
        total_verified         = round(float(actual_hours) + paid_leave_hours, 2)
        duty_hour              = _safe_float(getattr(emp, "duty_hour", 0.0))
        standard_monthly_hours = duty_hour * 26
        base_salary            = _safe_float(
            getattr(emp, "salary_amount", getattr(emp, "salary", 0.0))
        )

        writer.writerow([
            emp.employee_id,
            emp.user.name if emp.user else "Unknown",
            total_verified,
            paid_leave_hours,
            standard_monthly_hours,
            round(base_salary, 2),
        ])

    output.seek(0)
    filename = f"Payroll_{month}_{year}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# GET /payslip/{employee_id}/{month}/{year}  — PDF download
# ---------------------------------------------------------------------------

@router.get("/payslip/{employee_id}/{month}/{year}")
def generate_payslip_pdf(
    employee_id: str,
    month: int,
    year:  int,
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.lib import colors
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab is not installed.")

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Use locked payroll if available, otherwise live-calculate
    locked = db.query(MonthlyPayroll).filter(
        MonthlyPayroll.employee_id == employee_id,
        MonthlyPayroll.month == month,
        MonthlyPayroll.year  == year,
    ).first()

    if locked:
        calc = {
            "total_actual_hours":      locked.total_actual_hours      or 0.0,
            "total_benefit_hours":     locked.total_benefit_hours     or 0.0,
            "penalty_deduction_hours": getattr(locked, "penalty_deduction_hours", 0.0) or 0.0,
            "final_billable_hours":    locked.final_billable_hours    or 0.0,
            "hourly_rate_at_time":     locked.hourly_rate_at_time     or 0.0,
            "base_salary":             getattr(locked, "base_salary", 0.0) or 0.0,
            "gross_salary":            locked.gross_salary            or 0.0,
            "food_allowance":          locked.food_allowance          or 0.0,
            "other_allowance":         locked.other_allowance         or 0.0,
            "bonus":                   locked.bonus                   or 0.0,
            "deduction":               locked.deduction               or 0.0,
            "net_salary":              locked.net_salary              or 0.0,
            "late_count":              getattr(locked, "late_count", 0) or 0,
            "early_leave_count":       getattr(locked, "early_leave_count", 0) or 0,
        }
    else:
        calc = _calc_payroll_for_employee(employee, month, year, db)

    duty_hour  = _safe_float(getattr(employee, "duty_hour", 0.0))
    base_salary = calc["base_salary"]
    emp_name    = employee.user.name if employee.user else "Unknown"
    designation = getattr(employee, "designation", "") or ""

    # ── Build PDF ────────────────────────────────────────────────────────────
    buffer = io.BytesIO()
    p = rl_canvas.Canvas(buffer, pagesize=A4)
    W, H = A4

    # Header bar
    p.setFillColor(colors.HexColor("#0f172a"))
    p.rect(0, H - 80, W, 80, fill=1, stroke=0)

    p.setFillColor(colors.white)
    p.setFont("Helvetica-Bold", 18)
    p.drawString(40, H - 38, "AFAM GROUP")
    p.setFont("Helvetica", 10)
    p.drawString(40, H - 56, "Monthly Payslip")

    p.setFont("Helvetica", 9)
    period_text = f"Period: {datetime(year, month, 1).strftime('%B %Y')}   |   Generated: {datetime.now().strftime('%d %b %Y')}"
    p.drawRightString(W - 40, H - 44, period_text)

    # Employee info block
    y = H - 110
    p.setFillColor(colors.HexColor("#f8fafc"))
    p.rect(30, y - 40, W - 60, 50, fill=1, stroke=0)

    p.setFillColor(colors.HexColor("#0f172a"))
    p.setFont("Helvetica-Bold", 12)
    p.drawString(44, y - 10, emp_name)
    p.setFont("Helvetica", 9)
    p.setFillColor(colors.HexColor("#64748b"))
    p.drawString(44, y - 24, f"{designation}   |   ID: {employee_id}   |   Duty: {duty_hour}h/day   |   Standard: {duty_hour * 26:.0f}h/month")

    # Section: Hours breakdown
    y -= 70
    def section_title(title, ypos):
        p.setFillColor(colors.HexColor("#3b82f6"))
        p.rect(30, ypos - 2, 4, 16, fill=1, stroke=0)
        p.setFillColor(colors.HexColor("#0f172a"))
        p.setFont("Helvetica-Bold", 10)
        p.drawString(40, ypos, title)

    def row(label, value, ypos, bold=False, color="#0f172a"):
        p.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        p.setFillColor(colors.HexColor("#64748b"))
        p.drawString(50, ypos, label)
        p.setFillColor(colors.HexColor(color))
        p.drawRightString(W - 40, ypos, value)

    section_title("Hours Summary", y)
    y -= 22
    row("Actual Hours Worked",              f"{calc['total_actual_hours']:.2f} h",            y)
    y -= 16
    row("Paid Leave / Benefit Hours",       f"+{calc['total_benefit_hours']:.2f} h",           y, color="#16a34a")
    y -= 16
    row("Penalty Deduction Hours",          f"-{calc['penalty_deduction_hours']:.2f} h",       y, color="#dc2626")
    y -= 16
    row("Final Billable Hours",             f"{calc['final_billable_hours']:.2f} h",            y, bold=True)

    # Divider
    y -= 20
    p.setStrokeColor(colors.HexColor("#e2e8f0"))
    p.line(30, y, W - 30, y)

    # Section: Earnings & Deductions
    y -= 20
    section_title("Earnings & Deductions", y)
    y -= 22
    row("Base Salary (Standard Month)",     f"SAR {base_salary:,.2f}",                        y)
    y -= 16
    row(f"Gross Salary ({calc['final_billable_hours']:.1f}h × SAR {calc['hourly_rate_at_time']:.4f}/h)",
                                            f"SAR {calc['gross_salary']:,.2f}",                 y)
    y -= 16
    if calc["food_allowance"] > 0:
        row("Food Allowance",               f"+SAR {calc['food_allowance']:,.2f}",             y, color="#16a34a")
        y -= 16
    if calc["bonus"] > 0 or calc["other_allowance"] > 0:
        row("Bonus / Other Allowance",      f"+SAR {(calc['bonus'] + calc['other_allowance']):,.2f}", y, color="#16a34a")
        y -= 16
    if calc["deduction"] > 0:
        row("Deductions",                   f"-SAR {calc['deduction']:,.2f}",                  y, color="#dc2626")
        y -= 16
    if calc["late_count"] or calc["early_leave_count"]:
        row(f"Infractions: {calc['late_count']} Late + {calc['early_leave_count']} Early Leave",
                                            f"(Grace: 4 | Triggered: {max(0, calc['late_count']+calc['early_leave_count']-4)})",
                                            y, color="#b45309")
        y -= 16

    # Net Salary box
    y -= 20
    p.setFillColor(colors.HexColor("#0f172a"))
    p.rect(30, y - 40, W - 60, 52, fill=1, stroke=0)

    p.setFillColor(colors.white)
    p.setFont("Helvetica", 9)
    p.drawString(44, y - 10, "NET SALARY PAYABLE")
    p.setFont("Helvetica-Bold", 20)
    p.drawString(44, y - 32, f"SAR {calc['net_salary']:,.2f}")

    p.setFont("Helvetica", 8)
    p.setFillColor(colors.HexColor("#94a3b8"))
    p.drawRightString(W - 44, y - 30, f"Rate: SAR {calc['hourly_rate_at_time']:.4f}/hr")

    # Footer
    p.setFillColor(colors.HexColor("#94a3b8"))
    p.setFont("Helvetica-Oblique", 8)
    p.drawCentredString(W / 2, 30, "This is a system-generated payslip. Final approval required by authorized administrator.")

    p.showPage()
    p.save()
    buffer.seek(0)

    filename = f"Payslip_{employee_id}_{month}_{year}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# GET /dashboard-stats  — lightweight, does NOT run full calculation
# ---------------------------------------------------------------------------

@router.get("/dashboard-stats")
def get_payroll_dashboard_stats(
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin", "read_only_admin", "auditor"]))
):
    now = datetime.now()

    # Use locked payroll if available for this month (fast path)
    locked_rows = db.query(MonthlyPayroll).filter(
        MonthlyPayroll.month == now.month,
        MonthlyPayroll.year  == now.year,
    ).all()

    if locked_rows:
        total_payout  = sum(r.net_salary or 0.0 for r in locked_rows)
        total_hours   = sum(r.total_actual_hours or 0.0 for r in locked_rows)
        employee_count = len(locked_rows)
    else:
        # Fallback: aggregate from Attendance directly (no heavy calc)
        total_hours_row = db.query(func.sum(Attendance.hours_worked)).filter(
            Attendance.status != "Absent",
            extract("month", Attendance.check_in) == now.month,
            extract("year",  Attendance.check_in) == now.year,
        ).scalar() or 0.0
        total_hours    = round(float(total_hours_row), 2)
        total_payout   = 0.0
        employee_count = db.query(Employee).filter(Employee.is_active == True).count()

    return {
        "total_monthly_payout":  round(total_payout, 2),
        "total_verified_hours":  round(total_hours, 2),
        "active_payroll_count":  employee_count,
        "month_name":            now.strftime("%B"),
        "is_locked":             len(locked_rows) > 0,
    }


# ---------------------------------------------------------------------------
# PUT /update-adjustments/{payroll_id}
# ---------------------------------------------------------------------------

@router.put("/update-adjustments/{payroll_id}")
def update_payroll_adjustments(
    payroll_id: int,
    food:       float = 0.0,
    other:      float = 0.0,
    bonus:      float = 0.0,
    deduction:  float = 0.0,
    db: Session = Depends(get_db),
    current_user=Depends(roles_required(["admin"]))
):
    record = db.query(MonthlyPayroll).filter(MonthlyPayroll.id == payroll_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Payroll record not found")

    record.food_allowance  = food
    record.other_allowance = other
    record.bonus           = bonus
    record.deduction       = deduction
    record.net_salary      = (record.gross_salary + food + other + bonus) - deduction

    db.commit()
    db.refresh(record)
    return {"status": "success", "new_net": record.net_salary}










# import csv
# import io
# from fastapi import APIRouter, Depends, HTTPException, status
# from sqlalchemy.orm import Session
# from sqlalchemy import extract, func
# from typing import List
# from datetime import datetime
# from app.api import deps
# from app.core.database import get_db 
# from app.models.employee import Employee
# from app.models.attendance import Attendance, AttendanceLog
# from app.models.payroll import MonthlyPayroll
# from app.schemas.payroll import PayrollResponse
# from app.core.attendance_logic import calculate_hours
# from fastapi.responses import StreamingResponse
# from reportlab.lib.pagesizes import A4
# from reportlab.pdfgen import canvas
# from fastapi.responses import Response

# router = APIRouter()

# MONTHLY_STANDARD_HOURS = 312 

# def get_weekly_hours(employee_id: str, month: int, year: int, db: Session):
#     logs = db.query(AttendanceLog).filter(
#         AttendanceLog.employee_id == employee_id,
#         extract('month', AttendanceLog.timestamp) == month,
#         extract('year', AttendanceLog.timestamp) == year
#     ).order_by(AttendanceLog.timestamp.asc()).all()

#     weekly_totals = {}
#     it = iter(logs)
#     for log_in in it:
#         if log_in.type == 'IN':
#             try:
#                 log_out = next(it)
#                 if log_out.type == 'OUT':
#                     hours = calculate_hours(log_in.timestamp, log_out.timestamp)
#                     week_num = log_in.timestamp.isocalendar()[1]
#                     week_key = f"W{week_num}"
#                     weekly_totals[week_key] = weekly_totals.get(week_key, 0.0) + hours
#             except StopIteration:
#                 break 

#     return weekly_totals



# @router.get("/calculate-batch/{month}/{year}", response_model=List[PayrollResponse])
# def calculate_batch_preview(month: int, year: int, db: Session = Depends(get_db)):
#     employees = db.query(Employee).filter(Employee.is_active == True).all()
#     results = []

#     for emp in employees:
#         # 1. Fetch Attendance 
#         attendance = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             extract('month', Attendance.check_in) == month,
#             extract('year', Attendance.check_in) == year
#         ).all()

#         # 2. Extract Actual Hours
#         actual_hours = sum(a.hours_worked for a in attendance if a.hours_worked) or 0.0
#         late_arrivals = sum(1 for a in attendance if getattr(a, 'is_late', False))
#         early_leaves = sum(1 for a in attendance if getattr(a, 'is_early_leave', False))

#         # 3. THE FIX: Benefit Hours pull strictly from the Database 'monthly_paid_leave'
#         benefit_hours = float(emp.monthly_paid_leave or 0.0)

#         # Safe extraction for duty hours
#         raw_duty = getattr(emp, 'duty_hour', 0.0)
#         try:
#             duty_hour = float(raw_duty) if raw_duty else 0.0
#         except ValueError:
#             duty_hour = 0.0

#         # 4. Penalty Logic
#         total_infractions = late_arrivals + early_leaves
#         penalty_triggers = max(0, total_infractions - 4)
#         deducted_days = penalty_triggers // 3
#         penalty_hours = deducted_days * duty_hour

#         # 5. Final Billable Hours (Actual + Database Benefit - Penalty)
#         final_billable = (actual_hours + benefit_hours) - penalty_hours
        
#         # Safely extract the correct salary amount
#         raw_salary = getattr(emp, 'salary_amount', getattr(emp, 'salary', 0.0))
#         try:
#             base_salary = float(str(raw_salary).replace('SAR', '').replace(',', '').strip()) if raw_salary else 0.0
#         except ValueError:
#             base_salary = 0.0
        
#         standard_monthly_hours = duty_hour * 26
        
#         # Hourly Rate & Gross Calculation
#         if base_salary > 0 and standard_monthly_hours > 0:
#             hourly_rate = round((base_salary / standard_monthly_hours), 2)
#         else:
#             hourly_rate = 0.0
        
#         gross_salary = final_billable * hourly_rate

#         results.append({
#             "employee_id": emp.employee_id,
#             "name": emp.user.name if emp.user else "Unknown",
#             "month": month,
#             "year": year,
#             "total_actual_hours": round(actual_hours, 2),
#             "total_benefit_hours": benefit_hours,
#             "total_paid_leave_hours": 0.0, # Kept at 0.0 so Pydantic doesn't crash, but we aren't using it anymore
#             "penalty_deduction_hours": round(penalty_hours, 2),
#             "final_billable_hours": round(final_billable, 2),
#             "hourly_rate_at_time": hourly_rate,
#             "base_salary": round(base_salary, 2),
#             "gross_salary": round(gross_salary, 2),
#             "net_salary": round(gross_salary, 2),
#             "late_count": late_arrivals,
#             "early_leave_count": early_leaves,
#             "status": "Warning" if deducted_days > 0 else "Good",
#             "duty_hour": duty_hour,
#             "food_allowance": 0.0,
#             "other_allowance": 0.0,
#             "bonus": 0.0,
#             "deduction": 0.0,
#             "weekly_breakdown": get_weekly_hours(emp.employee_id, month, year, db)
#         })
#     return results


# @router.post("/generate-batch/{month}/{year}")
# def lock_and_save_payroll(month: int, year: int, db: Session = Depends(get_db)):
#     data_to_save = calculate_batch_preview(month, year, db)
    
#     for item in data_to_save:
#         existing = db.query(MonthlyPayroll).filter(
#             MonthlyPayroll.employee_id == item['employee_id'],
#             MonthlyPayroll.month == month,
#             MonthlyPayroll.year == year
#         ).first()

#         if not existing:
#             new_record = MonthlyPayroll(
#                 employee_id=item['employee_id'],
#                 month=month,
#                 year=year,
#                 total_actual_hours=item['total_actual_hours'],
#                 total_benefit_hours=item['total_benefit_hours'],
#                 final_billable_hours=item['final_billable_hours'],
#                 hourly_rate_at_time=item['hourly_rate_at_time'],
#                 gross_salary=item['gross_salary'],
#                 net_salary=item['net_salary'],
#                 weekly_breakdown=item['weekly_breakdown'],
#                 status="locked"
#             )
#             db.add(new_record)
    
#     try:
#         db.commit()
#         return {"status": "success", "message": f"Payroll for {month}/{year} generated."}
#     except Exception:
#         db.rollback()
#         raise HTTPException(status_code=500, detail="Failed to save payroll batch.")

# @router.get("/summary")
# def get_payroll_summary(db: Session = Depends(get_db)):
#     now = datetime.now()
#     employees = db.query(Employee).filter(Employee.is_active == True).all()
    
#     report = []
#     for emp in employees:
#         total_hours = db.query(func.sum(Attendance.hours_worked)).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.is_verified == True,
#             extract('month', Attendance.check_in) == now.month,
#             extract('year', Attendance.check_in) == now.year
#         ).scalar() or 0

#         report.append({
#             "name": emp.user.name,
#             "employee_id": emp.employee_id,
#             "total_hours": round(total_hours, 2),
#             "category": "Bonus (OT)" if total_hours >= 84 else "Full" if total_hours >= 78 else "Partial",
#             "progress": min(round((total_hours / 78) * 100, 1), 100)
#         })
#     return report

# @router.get("/export-csv")
# def export_payroll_csv(db: Session = Depends(get_db)):
#     now = datetime.now()
#     employees = db.query(Employee).filter(Employee.is_active == True).all()
    
#     output = io.StringIO()
#     writer = csv.writer(output)
#     writer.writerow(["Employee ID", "Name", "Total Verified Hours", "Salary Category"])
    
#     for emp in employees:
#         total_hours = db.query(func.sum(Attendance.hours_worked)).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.is_verified == True,
#             extract('month', Attendance.check_in) == now.month
#         ).scalar() or 0
        
#         category = "Bonus (84h+)" if total_hours >= 84 else "Full (78h+)" if total_hours >= 78 else "Partial"
#         writer.writerow([emp.employee_id, emp.user.name, round(total_hours, 2), category])
    
#     output.seek(0)
#     return StreamingResponse(
#         iter([output.getvalue()]),
#         media_type="text/csv",
#         headers={"Content-Disposition": f"attachment; filename=Payroll_{now.month}_{now.year}.csv"}
#     )

# @router.get("/payslip/{employee_id}/{month}/{year}")
# def generate_payslip_pdf(employee_id: str, month: int, year: int, db: Session = Depends(get_db)):
#     payroll = db.query(MonthlyPayroll).filter(
#         MonthlyPayroll.employee_id == employee_id,
#         MonthlyPayroll.month == month,
#         MonthlyPayroll.year == year
#     ).first()

#     if not payroll:
#         raise HTTPException(status_code=404, detail="Payroll not found")

#     employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    
#     # Safe extraction for PDF generator
#     raw_salary = getattr(employee, 'salary_amount', getattr(employee, 'salary', 0.0))
#     try:
#         pdf_base_salary = float(str(raw_salary).replace('SAR', '').replace(',', '').strip()) if raw_salary else 0.0
#     except ValueError:
#         pdf_base_salary = 0.0
        
#     raw_duty = getattr(employee, 'duty_hour', 0.0)
#     try:
#         pdf_duty_hour = float(raw_duty) if raw_duty else 0.0
#     except ValueError:
#         pdf_duty_hour = 0.0
    
#     buffer = io.BytesIO()
#     p = canvas.Canvas(buffer, pagesize=A4)
#     width, height = A4 

#     p.setFont("Helvetica-Bold", 16)
#     p.drawString(50, height - 50, "AFAM GROUP - MONTHLY PAYSLIP")
#     p.setFont("Helvetica", 10)
#     p.drawString(50, height - 65, f"Period: {month}/{year} | Printed: {datetime.now().strftime('%Y-%m-%d')}")

#     p.line(50, height - 75, 550, height - 75)
#     p.setFont("Helvetica-Bold", 11)
#     p.drawString(50, height - 95, f"Name: {employee.user.name}")
#     p.drawString(300, height - 95, f"Employee ID: {employee.employee_id}")
#     p.setFont("Helvetica", 10)
#     p.drawString(50, height - 110, f"Designation: {employee.designation}")
#     p.drawString(300, height - 110, f"Duty Hours: {pdf_duty_hour}h / Day")

#     y = height - 150
#     p.setFont("Helvetica-Bold", 11)
#     p.drawString(50, y, "Earnings Description")
#     p.drawString(450, y, "Amount (SAR)")
#     p.line(50, y - 5, 550, y - 5)

#     p.setFont("Helvetica", 10)
#     y -= 25
#     p.drawString(50, y, f"Basic Salary (standard {pdf_duty_hour}h cycle)")
#     p.drawString(450, y, f"{pdf_base_salary:,.2f}")

#     y -= 20
#     p.drawString(50, y, f"Total Billable Hours ({payroll.total_actual_hours}h + {payroll.total_benefit_hours}h Leave)")
#     p.drawString(450, y, f"{payroll.gross_salary:,.2f}")

#     y -= 20
#     p.drawString(50, y, "Food Allowance")
#     p.drawString(450, y, f"{payroll.food_allowance:,.2f}")

#     y -= 20
#     p.drawString(50, y, "Other Allowance / Bonus")
#     p.drawString(450, y, f"{(payroll.other_allowance + payroll.bonus):,.2f}")

#     y -= 20
#     p.setFont("Helvetica-Oblique", 10)
#     p.drawString(50, y, "Deductions")
#     p.drawString(450, y, f"- {payroll.deduction:,.2f}")

#     y -= 30
#     p.line(50, y, 550, y)
#     p.setFont("Helvetica-Bold", 12)
#     p.drawString(50, y - 20, "NET SALARY PAYABLE")
#     p.drawString(450, y - 20, f"{payroll.net_salary:,.2f} SAR")

#     p.showPage()
#     p.save()
#     buffer.seek(0)
#     return Response(content=buffer.getvalue(), media_type="application/pdf")

# @router.get("/dashboard-stats")
# def get_payroll_dashboard_stats(db: Session = Depends(get_db)):
#     now = datetime.now()
#     payroll_preview = calculate_batch_preview(now.month, now.year, db)
    
#     total_payout = sum(item['gross_salary'] for item in payroll_preview)
#     total_hours = sum(item['total_actual_hours'] for item in payroll_preview)
#     employee_count = len(payroll_preview)
    
#     return {
#         "total_monthly_payout": round(total_payout, 2),
#         "total_verified_hours": round(total_hours, 2),
#         "active_payroll_count": employee_count,
#         "month_name": now.strftime('%B')
#     }

# @router.put("/update-adjustments/{payroll_id}")
# def update_payroll_adjustments(
#     payroll_id: int, 
#     food: float, 
#     other: float, 
#     bonus: float, 
#     deduction: float, 
#     db: Session = Depends(get_db)
# ):
#     record = db.query(MonthlyPayroll).filter(MonthlyPayroll.id == payroll_id).first()
#     if not record:
#         raise HTTPException(status_code=404, detail="Payroll record not found")
    
#     record.food_allowance = food
#     record.other_allowance = other
#     record.bonus = bonus
#     record.deduction = deduction
    
#     record.net_salary = (record.gross_salary + food + other + bonus) - deduction
    
#     db.commit()
#     return {"status": "success", "new_net": record.net_salary}