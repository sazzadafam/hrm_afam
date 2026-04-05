from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime

class LeaveRequest(Base): # <--- MUST MATCH THIS EXACTLY
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    leave_type = Column(String, nullable=False) # e.g., Sick, Annual, Casual
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String, default="pending") # pending, approved, rejected
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship to User
    user = relationship("User")