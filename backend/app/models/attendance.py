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
    last_break_start = Column(DateTime, nullable=True)
    total_break_minutes = Column(Float, default=0.0)
    # ADD THIS LINE HERE
    is_verified = Column(Boolean, default=False) 
    # Ensure these exist for the penalty logic as well
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
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    type = Column(String)  # "IN", "OUT", "BREAK_START", "BREAK_END"
    source = Column(String, default="ZK_MACHINE")
    status = Column(String, default="pending")


class ManualEntryCreate(BaseModel):
    employee_id: str
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    # For bulk or single ZK-style manual logs
    timestamp: Optional[datetime] = None
    type: Optional[Literal['IN', 'OUT', 'BREAK_START', 'BREAK_END']] = None












# from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Time, func
# from sqlalchemy.orm import relationship
# from app.core.database import Base
# from datetime import datetime
# from pydantic import BaseModel
# from typing import Literal


# class Attendance(Base):
#     __tablename__ = "attendance"

#     id = Column(Integer, primary_key=True, index=True)
#     # user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
#     user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
#     employee_id = Column(String(50), ForeignKey("employees.employee_id", ondelete="CASCADE"), index=True)    
#     check_in = Column(DateTime, nullable=False)
#     check_out = Column(DateTime, nullable=True)
#     hours_worked = Column(Float, default=0.0)
#     week_number = Column(Integer)
#     shift_type = Column(String(20))  # "Day" (04-16) or "Night" (16-04)
#     status = Column(String(20), default="completed") # "ongoing" or "completed"
   

#     user = relationship("User", back_populates="attendances")
#     employee_record = relationship("Employee", back_populates="attendances")


# #also using AdjustmentRequest in your admin.py, add it here too:
# class AdjustmentRequest(Base):
#     __tablename__ = "attendance_adjustments"
#     id = Column(Integer, primary_key=True, index=True)
#     attendance_id = Column(Integer, ForeignKey("attendance.id", ondelete="CASCADE"))
#     reason = Column(String)
#     status = Column(String, default="pending") # pending, approved, rejected


# #For manual Entry
# class ManualEntryCreate(BaseModel):
#     employee_id: str
#     timestamp: datetime
#     type: Literal['IN', 'OUT']


# #Attendance Log
# class AttendanceLog(Base):
#     __tablename__ = "attendance_logs"

#     id = Column(Integer, primary_key=True, index=True)
#     employee_id = Column(String, ForeignKey("employees.employee_id", ondelete="CASCADE"))
#     timestamp = Column(DateTime, nullable=False, default=datetime.now, server_default=func.now())
#     type = Column(String)  # "IN" or "OUT"
#     # NEW FIELDS FOR TRACKING
#     source = Column(String, default="ZK_MACHINE")  # "ZK_MACHINE" or "MANUAL_ENTRY"
#     status = Column(String, default="pending")    # "pending", "processed", or "error"