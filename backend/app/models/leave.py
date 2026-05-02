from sqlalchemy import Column, Integer, String, Date, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id                  = Column(Integer, primary_key=True, index=True)
    user_id             = Column(Integer, ForeignKey("users.id"), nullable=False)
    leave_type          = Column(String, nullable=False)        # Sick | Annual | Casual | Medical | Emergency
    start_date          = Column(Date, nullable=False)
    end_date            = Column(Date, nullable=False)
    reason              = Column(Text, nullable=True)
    medical_report_url  = Column(String, nullable=True)         # ← was missing, caused AttributeError
    status              = Column(String, default="pending")     # pending | approved | rejected
    created_at          = Column(DateTime, default=datetime.utcnow)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    manager_remarks = Column(Text, nullable=True)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])