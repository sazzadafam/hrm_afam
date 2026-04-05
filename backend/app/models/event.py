from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from app.core.database import Base
from datetime import datetime

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)  
    is_holiday = Column(Boolean, default=False)
    type = Column(String(50), default="event")
    created_at = Column(DateTime, default=datetime.utcnow)