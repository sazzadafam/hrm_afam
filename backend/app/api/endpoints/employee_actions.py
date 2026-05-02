import os
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.models.leave import LeaveRequest
from app.models.user import User
from app.api import deps
from app.core.database import get_db

router = APIRouter()

UPLOAD_DIR = "uploads/medical"

# 1. Secure File Access
@router.get("/leave/medical-report/{request_id}")
async def get_medical_report(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    leave_req = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not leave_req or not leave_req.medical_report_url:
        raise HTTPException(status_code=404, detail="Report not found")

    # Security: Only the employee who owns the request or an Admin/Manager can view it
    is_owner = leave_req.user_id == current_user.id
    is_privileged = current_user.role.name in ["Admin", "Manager"]
    
    if not (is_owner or is_privileged):
        raise HTTPException(status_code=403, detail="Not authorized to view this report")

    return FileResponse(leave_req.medical_report_url)

# 2. Manager Approval Logic
@router.patch("/leave/approve/{request_id}")
async def approve_leave(
    request_id: int,
    status: str, # "approved" or "rejected"
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    if current_user.role.name not in ["Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Only managers can approve leave")

    leave_req = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not leave_req:
        raise HTTPException(status_code=404, detail="Request not found")

    leave_req.status = status
    db.commit()
    
    # Trigger WebSocket notification to the employee
    # from app.endpoints.employee_self import emp_notification_manager
    # await emp_notification_manager.broadcast_to_user(leave_req.user_id, {"type": "LEAVE_STATUS", "status": status})

    return {"message": f"Leave {status} successfully"}