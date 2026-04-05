from datetime import datetime
from sqlalchemy.orm import Session
from app.models.employee import Employee

def process_biometric_punch(db: Session, zk_id: str, timestamp: datetime):
    """
    Validates the employee existence and status.
    """
    employee = db.query(Employee).filter(
        Employee.employee_id == zk_id,
        Employee.is_active == True
    ).first()

    if not employee:
        print(f"⚠️ [PUNCH REJECTED]: ID {zk_id} at {timestamp}. Reason: Inactive/Missing.")
        return {"status": "ignored", "reason": "inactive_employee"}

    return {"status": "success", "employee": employee.user.name}
