import os
import uuid
import shutil
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from app.models.leave import LeaveRequest
from app.models.attendance import Attendance
from app.core.database import get_db
from app.api import deps

router = APIRouter()

# --- CONFIGURATION ---
UPLOAD_DIR = "uploads/medical"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# --- ENDPOINTS ---

@router.get("/me")
async def get_my_profile(current_user=Depends(deps.get_current_active_user)):
    """Fetch profile data for the dashboard"""
    return current_user

@router.get("/attendance")
async def get_my_attendance(
    db: Session = Depends(get_db),
    current_user=Depends(deps.get_current_active_user)
):
    """Fetch personal attendance records from ZKTeco synced data"""
    return db.query(Attendance).filter(Attendance.user_id == current_user.id).all()

@router.post("/leave/request")
async def create_leave(
    leave_type: str = Form(...),
    start_date: date = Form(...),
    end_date: date = Form(...),
    reason: str = Form(None),
    medical_report: Optional[UploadFile] = File(None), 
    db: Session = Depends(get_db),
    current_user = Depends(deps.get_current_active_user)
):
    # 1. Basic Date Validation
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="End date cannot be before start date.")

    # 2. Logic: If medical leave, report is MANDATORY
    if leave_type.lower() == "medical" and not medical_report:
        raise HTTPException(status_code=400, detail="Medical report image is required for medical leave.")

    # 3. Handle File Upload
    file_path = None
    if medical_report:
        file_extension = medical_report.filename.split(".")[-1]
        filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(medical_report.file, buffer)
        except Exception:
            raise HTTPException(status_code=500, detail="Could not save file.")

    # 4. Save to Database
    new_leave = LeaveRequest(
        user_id=current_user.id,
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        reason=reason,
        medical_report_url=file_path,
        status="pending"
    )
    
    db.add(new_leave)
    db.commit()
    db.refresh(new_leave)
    
    return {"message": "Leave request submitted successfully", "id": new_leave.id}