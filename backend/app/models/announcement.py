from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Time, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime

class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    content = Column(Text)