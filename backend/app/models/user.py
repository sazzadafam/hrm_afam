from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    role = relationship("Role", back_populates="users")
    employee_profile = relationship("Employee", back_populates="user", uselist=False, cascade="all, delete")
    attendances = relationship("Attendance", back_populates="user")
