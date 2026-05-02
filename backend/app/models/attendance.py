from sqlalchemy import Boolean, Column, Integer, String, Float, DateTime, ForeignKey, Time, func
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime
from pydantic import BaseModel
from typing import Literal, Optional

class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    employee_id = Column(String(50), ForeignKey("employees.employee_id", ondelete="CASCADE"), index=True)    
    check_in = Column(DateTime, nullable=False)
    check_out = Column(DateTime, nullable=True)
    hours_worked = Column(Float, default=0.0)
    week_number = Column(Integer)
    shift_type = Column(String(20))  
    status = Column(String(20), default="ongoing") 
    
    # Frozen schedule data (Step 1 implementation)
    shift_start = Column(String, nullable=True)
    shift_end = Column(String, nullable=True)
    duty_hour = Column(Float, nullable=True)

    # --- SPLIT SHIFT TRACKING ---
    # When they leave for break (e.g., 12:00 PM)
    last_break_start = Column(DateTime, nullable=True)
    # When they return from break (e.g., 06:30 PM)
    last_break_end = Column(DateTime, nullable=True) 
    total_break_minutes = Column(Float, default=0.0)
    
    # Verification & Penalties
    is_verified = Column(Boolean, default=False) 
    is_late = Column(Boolean, default=False)
    is_early_leave = Column(Boolean, default=False)
    
    user = relationship("User", back_populates="attendances")
    employee_record = relationship("Employee", back_populates="attendances")

class AdjustmentRequest(Base):
    __tablename__ = "attendance_adjustments"
    id = Column(Integer, primary_key=True, index=True)
    attendance_id = Column(Integer, ForeignKey("attendance.id", ondelete="CASCADE"))
    reason = Column(String)
    status = Column(String, default="pending") 

class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, ForeignKey("employees.employee_id", ondelete="CASCADE"))
    # Use timezone-aware defaults if your backend is using the new UTC helper
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    type = Column(String)  # "IN", "OUT", "BREAK_START", "BREAK_END"
    source = Column(String, default="ZK_MACHINE")
    status = Column(String, default="pending")

class ManualEntryCreate(BaseModel):
    employee_id: str
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    timestamp: Optional[datetime] = None
    type: Optional[Literal['IN', 'OUT', 'BREAK_START', 'BREAK_END']] = None


