from app.core.database import SessionLocal
from app.models.attendance import Attendance
from sqlalchemy import func


def process_weekly_payroll():
    db = SessionLocal()
    try:
        results = db.query(
            Attendance.employee_id, 
            func.sum(Attendance.hours_worked).label('total_hours')
        ).group_by(Attendance.employee_id).all()

        for res in results:
            print(f"Employee {res.employee_id}: Paid for {min(res.total_hours + 6, 84)} hours")
            
    finally:
        db.close()