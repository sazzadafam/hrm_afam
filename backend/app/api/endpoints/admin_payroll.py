import csv
import io
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from typing import List
from datetime import datetime
from app.core.database import get_db 
from app.models.employee import Employee
from app.models.attendance import Attendance
from app.models.payroll import MonthlyPayroll
from app.schemas.payroll import PayrollResponse
from fastapi.responses import StreamingResponse, Response
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

router = APIRouter()


@router.get("/calculate-batch/{month}/{year}", response_model=List[PayrollResponse])
def calculate_batch_preview(month: int, year: int, db: Session = Depends(get_db)):
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    results = []

    for emp in employees:
        # 1. Fetch Verified Attendance
        attendance = db.query(Attendance).filter(
            Attendance.employee_id == emp.employee_id,
            extract('month', Attendance.check_in) == month,
            extract('year', Attendance.check_in) == year,
            Attendance.is_verified == True
        ).all()

        # 2. Logic for "Benefit" Column (78h Week = 84h Pay)
        # We calculate how many weeks they worked to give 6h bonus per week
        unique_weeks = set(a.check_in.isocalendar()[1] for a in attendance)
        benefit_hours = len(unique_weeks) * 6.0

        # 3. Monthly Goal (Fixed at 312h as per your UI)
        monthly_goal = 312.0
        
        # 4. Actual Worked Hours
        actual_hours = sum(a.hours_worked for a in attendance) or 0.0

        # 5. Paid Leave & Penalties
        paid_leave = emp.monthly_paid_leave or 0.0
        late_count = sum(1 for a in attendance if getattr(a, 'is_late', False))
        early_count = sum(1 for a in attendance if getattr(a, 'is_early_leave', False))
        
        # Penalty: 4 free, then 3 = 1 Day (duty_hour) deduction
        penalty_triggers = max(0, (late_count + early_count) - 4)
        penalty_hours = (penalty_triggers // 3) * (emp.duty_hour or 0)

        # 6. Final Billable & Payout
        final_billable = (actual_hours + benefit_hours + paid_leave) - penalty_hours
        hourly_rate = (emp.salary / (emp.duty_hour * 26)) if (emp.salary and emp.duty_hour) else 0
        estimated_payout = final_billable * hourly_rate

        # Matching the frontend keys exactly
        results.append({
            "employee_id": emp.employee_id,
            "name": emp.user.name if emp.user else "Unknown",
            "month": month,
            "year": year,
            "benefit": f"+{benefit_hours}h",
            "monthly_goal": 312.0,
            "actual_hours": round(actual_hours, 2),
            "total_actual_hours": round(actual_hours, 2),
            "total_benefit_hours": benefit_hours,
            "penalty_deduction_hours": penalty_hours,
            "final_billable_hours": final_billable,
            "estimated_payout": round(estimated_payout, 2),
            "gross_salary": round(estimated_payout, 2),
            "net_salary": round(estimated_payout, 2),
            "status": "Warning" if penalty_hours > 0 else "Good",
            "late_count": late_count,
            "early_leave_count": early_count,
            "total_paid_leave_hours": paid_leave
        })
    return results



@router.post("/generate-batch/{month}/{year}")
def lock_and_save_payroll(month: int, year: int, db: Session = Depends(get_db)):
    """Locks the calculated preview into the database for the history."""
    data_to_save = calculate_batch_preview(month, year, db)
    
    for item in data_to_save:
        # Prevent duplicates for the same month/year
        db.query(MonthlyPayroll).filter(
            MonthlyPayroll.employee_id == item['employee_id'],
            MonthlyPayroll.month == month,
            MonthlyPayroll.year == year
        ).delete()

        new_record = MonthlyPayroll(
            employee_id=item['employee_id'],
            month=month,
            year=year,
            total_actual_hours=item['total_actual_hours'],
            total_benefit_hours=item['total_benefit_hours'],
            total_paid_leave_hours=item['total_paid_leave_hours'],
            penalty_deduction_hours=item['penalty_deduction_hours'],
            final_billable_hours=item['final_billable_hours'],
            hourly_rate_at_time= (item['gross_salary'] / item['final_billable_hours']) if item['final_billable_hours'] > 0 else 0,
            gross_salary=item['gross_salary'],
            net_salary=item['net_salary'],
            status="locked"
        )
        db.add(new_record)
    
    try:
        db.commit()
        return {"status": "success", "message": f"Payroll for {month}/{year} generated and locked."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")

@router.get("/payslip/{employee_id}/{month}/{year}")
def generate_payslip_pdf(employee_id: str, month: int, year: int, db: Session = Depends(get_db)):
    payroll = db.query(MonthlyPayroll).filter(
        MonthlyPayroll.employee_id == employee_id,
        MonthlyPayroll.month == month,
        MonthlyPayroll.year == year
    ).first()

    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll not found. Please generate it first.")

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # Header
    p.setFont("Helvetica-Bold", 16)
    p.drawString(50, height - 50, "AFAM GROUP - OFFICIAL PAYSLIP")
    p.setFont("Helvetica", 10)
    p.drawString(50, height - 65, f"Period: {month}/{year} | Date: {datetime.now().strftime('%Y-%m-%d')}")

    # Employee Details
    p.line(50, height - 75, 550, height - 75)
    p.setFont("Helvetica-Bold", 11)
    p.drawString(50, height - 95, f"Name: {employee.user.name}")
    p.drawString(300, height - 95, f"ID: {employee.employee_id}")
    p.setFont("Helvetica", 10)
    p.drawString(50, height - 110, f"Duty Cycle: {employee.duty_hour}h/Day")

    # Table
    y = height - 150
    p.setFont("Helvetica-Bold", 11)
    p.drawString(50, y, "Description")
    p.drawString(450, y, "Amount (SAR)")
    p.line(50, y - 5, 550, y - 5)

    p.setFont("Helvetica", 10)
    y -= 25
    p.drawString(50, y, "Base Monthly Salary")
    p.drawString(450, y, f"{employee.salary:,.2f}")

    y -= 20
    p.drawString(50, y, f"Actual Hours Worked ({payroll.total_actual_hours}h)")
    p.drawString(500, y, "-")

    y -= 20
    p.drawString(50, y, f"Grace/Leave Benefit (+{payroll.total_benefit_hours + payroll.total_paid_leave_hours}h)")
    p.drawString(450, y, "Included")

    if payroll.penalty_deduction_hours > 0:
        y -= 20
        p.setFont("Helvetica-Oblique", 10)
        p.drawString(50, y, f"Penalty Deduction (Lates/Early) -{payroll.penalty_deduction_hours}h")
        p.drawString(450, y, f"-{(payroll.penalty_deduction_hours * payroll.hourly_rate_at_time):,.2f}")
        p.setFont("Helvetica", 10)

    # Net Total
    y -= 40
    p.line(50, y, 550, y)
    p.setFont("Helvetica-Bold", 12)
    p.drawString(50, y - 20, "NET SALARY PAYABLE")
    p.drawString(450, y - 20, f"{payroll.net_salary:,.2f} SAR")

    p.showPage()
    p.save()
    buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf")

@router.get("/dashboard-stats")
def get_payroll_dashboard_stats(db: Session = Depends(get_db)):
    now = datetime.now()
    preview = calculate_batch_preview(now.month, now.year, db)
    
    return {
        "total_monthly_payout": round(sum(item['net_salary'] for item in preview), 2),
        "total_verified_hours": round(sum(item['total_actual_hours'] for item in preview), 2),
        "active_payroll_count": len(preview),
        "month_name": now.strftime('%B')
    }

@router.put("/update-adjustments/{payroll_id}")
def update_payroll_adjustments(
    payroll_id: int, 
    food: float, 
    other: float, 
    bonus: float, 
    deduction: float, 
    db: Session = Depends(get_db)
):
    record = db.query(MonthlyPayroll).filter(MonthlyPayroll.id == payroll_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    
    record.food_allowance = food
    record.other_allowance = other
    record.bonus = bonus
    record.deduction = deduction
    
    # Recalculate Net: (Gross + Allowances + Bonus) - Manual Deduction
    record.net_salary = (record.gross_salary + food + other + bonus) - deduction
    
    db.commit()
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
# from app.models import employee
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

# # Constant for your salary calculation: 78 hours/week * 4 weeks
# MONTHLY_STANDARD_HOURS = 312 

# def get_weekly_hours(employee_id: str, month: int, year: int, db: Session):
#     """
#     Fetches raw logs and groups them by ISO week to apply the 78h benefit rule.
#     """
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
#         # 1. Fetch Verified Attendance for the month
#         attendance = db.query(Attendance).filter(
#             Attendance.employee_id == emp.employee_id,
#             extract('month', Attendance.check_in) == month,
#             extract('year', Attendance.check_in) == year,
#             Attendance.is_verified == True
#         ).all()

#         # 2. Extract Base Stats
#         actual_hours = sum(a.hours_worked for a in attendance) or 0.0
#         late_arrivals = sum(1 for a in attendance if getattr(a, 'is_late', False))
#         early_leaves = sum(1 for a in attendance if getattr(a, 'is_early_leave', False))
        
#         # 3. Apply 78h/84h Rule (6h benefit per week worked)
#         unique_weeks = set(a.check_in.isocalendar()[1] for a in attendance)
#         benefit_hours = len(unique_weeks) * 6.0

#         # 4. Penalty Logic: First 4 free, then 3 = 1 Day Deduction
#         total_infractions = late_arrivals + early_leaves
#         penalty_triggers = max(0, total_infractions - 4)
#         deducted_days = penalty_triggers // 3
#         penalty_hours = deducted_days * emp.duty_hour

#         # 5. Paid Leave (From Employee Profile)
#         paid_leave_hours = emp.monthly_paid_leave or 0.0

#         # 6. Final Calculation
#         # (Actual + 6h/week + Monthly Paid Leave) - Penalties
#         final_billable = (actual_hours + benefit_hours + paid_leave_hours) - penalty_hours
        
#         # Hourly Rate Formula: Monthly Salary / (Duty Hour * 26 Days)
#         standard_monthly_hours = emp.duty_hour * 26
#         hourly_rate = (emp.salary / standard_monthly_hours) if (emp.salary > 0 and standard_monthly_hours > 0) else 0.0
        
#         gross_salary = final_billable * hourly_rate

#         results.append({
#             "employee_id": emp.employee_id,
#             "name": emp.user.name if emp.user else "Unknown",
#             "month": month,
#             "year": year,
#             "total_actual_hours": round(actual_hours, 2),
#             "total_benefit_hours": benefit_hours,
#             "total_paid_leave_hours": paid_leave_hours,
#             "penalty_deduction_hours": round(penalty_hours, 2),
#             "final_billable_hours": round(final_billable, 2),
#             "gross_salary": round(gross_salary, 2),
#             "net_salary": round(gross_salary, 2), # Initial net equals gross before manual adjustments
#             "late_count": late_arrivals,
#             "early_leave_count": early_leaves,
#             "status": "Warning" if deducted_days > 0 else "Good"
#         })
#     return results


# # @router.get("/calculate-batch/{month}/{year}", response_model=List[PayrollResponse])
# # def calculate_batch_preview(month: int, year: int, db: Session = Depends(get_db)):
# #     employees = db.query(Employee).filter(Employee.is_active == True).all()
# #     results = []

# #     for emp in employees:
# #         weekly_data = get_weekly_hours(emp.employee_id, month, year, db)
# #         actual_total = sum(weekly_data.values())
# #         benefit_total = 0.0
        
# #         # --- 1. NEW LEAVE RULE ---
# #         # 12h duty: 6h paid leave per week
# #         # 8h/10h duty: 1 full day (based on their duty_hour) per week
# #         for hours in weekly_data.values():
# #             if hours > 0: # Only apply if they worked during that week
# #                 if emp.duty_hour >= 12:
# #                     benefit_total += 6.0
# #                 else:
# #                     benefit_total += float(emp.duty_hour)
        
# #         final_billable = actual_total + benefit_total
        
# #         # --- 2. DYNAMIC HOURLY RATE ---
# #         # Formula: Monthly Salary / (Duty Hours * 26 Working Days)
# #         individual_standard = emp.duty_hour * 26
# #         base_salary = emp.salary or 0.0
# #         hourly_rate = base_salary / individual_standard if base_salary > 0 else 0.0
        
# #         gross_salary = final_billable * hourly_rate

# #         results.append({
# #             "employee_id": emp.employee_id,
# #             "name": emp.user.name if emp.user else "Unknown",
# #             "month": month,
# #             "year": year,
# #             "total_actual_hours": round(actual_total, 2),
# #             "total_benefit_hours": benefit_total,
# #             "final_billable_hours": round(final_billable, 2),
# #             "hourly_rate_at_time": round(hourly_rate, 4),
# #             "gross_salary": round(gross_salary, 2),
# #             # New fields initialized at 0.0 for the admin to edit
# #             "food_allowance": 0.0,
# #             "other_allowance": 0.0,
# #             "bonus": 0.0,
# #             "deduction": 0.0,
# #             "net_salary": round(gross_salary, 2),
# #             "weekly_breakdown": weekly_data
# #         })
# #     return results


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
#                 net_salary=item['gross_salary'],
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
#         # Summing verified hours from Attendance table
#         total_hours = db.query(func.sum(Attendance.hours_worked)).filter(
#             Attendance.employee_id == emp.employee_id,
#             Attendance.is_verified == True,
#             extract('month', Attendance.check_in) == now.month,
#             extract('year', Attendance.check_in) == now.year
#         ).scalar() or 0

#         # Progress based on the weekly target of 78h
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
    
#     buffer = io.BytesIO()
#     p = canvas.Canvas(buffer, pagesize=A4)
#     width, height = A4 # Corrected: Extract height from A4

#     # Header
#     p.setFont("Helvetica-Bold", 16)
#     p.drawString(50, height - 50, "AFAM GROUP - MONTHLY PAYSLIP")
#     p.setFont("Helvetica", 10)
#     p.drawString(50, height - 65, f"Period: {month}/{year} | Printed: {datetime.now().strftime('%Y-%m-%d')}")

#     # Employee Details
#     p.line(50, height - 75, 550, height - 75)
#     p.setFont("Helvetica-Bold", 11)
#     p.drawString(50, height - 95, f"Name: {employee.user.name}")
#     p.drawString(300, height - 95, f"Employee ID: {employee.employee_id}")
#     p.setFont("Helvetica", 10)
#     p.drawString(50, height - 110, f"Designation: {employee.designation}")
#     p.drawString(300, height - 110, f"Duty Hours: {employee.duty_hour}h / Day")

#     # Financial Table
#     y = height - 150
#     p.setFont("Helvetica-Bold", 11)
#     p.drawString(50, y, "Earnings Description")
#     p.drawString(450, y, "Amount (SAR)")
#     p.line(50, y - 5, 550, y - 5)

#     p.setFont("Helvetica", 10)
#     y -= 25
#     p.drawString(50, y, f"Basic Salary (standard {employee.duty_hour}h cycle)")
#     p.drawString(450, y, f"{employee.salary:,.2f}")

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

#     # Net Total
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
#     # Calculate totals for the current month
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


# @router.get("/dashboard-stats")
# def get_payroll_dashboard_stats(db: Session = Depends(get_db)):
#     # Example logic: replace with your actual summation logic
#     return {
#         "total_monthly_payout": 5000, # This will show as "SAR 45,000"
#         "total_verified_hours": 1240,
#         "active_payroll_count": 12,
#         "month_name": "March"
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
    
#     # Recalculate Net
#     record.net_salary = (record.gross_salary + food + other + bonus) - deduction
    
#     db.commit()
#     return {"status": "success", "new_net": record.net_salary}



