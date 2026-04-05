from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    
    # Basic & Identity
    employee_id = Column(String, unique=True, index=True, nullable=False) # ZK ID
    phone = Column(String, nullable=True)
    nationality = Column(String, nullable=True)
    iqama_number = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)
    dob = Column(String, nullable=True) 
    emergency_contact = Column(String, nullable=True) # Name/Relation/Phone
    
    # Job & Payroll
    department = Column(String, nullable=False) # Store Name
    designation = Column(String, nullable=True)
    shift_start = Column(String, default="08:00")
    shift_end = Column(String, default="20:00")
    duty_hour = Column(Float, default=12.0)
    
    # Salary Breakdown
    salary = Column(Float, default=0.0)        # Basic Salary
    food_allowance = Column(Float, default=0.0)
    conveyance = Column(Float, default=0.0)
    gross_salary = Column(Float, default=0.0)  # Total Sum
    ot_price = Column(Float, default=0.0)      # Overtime rate per hour
    
    # Other Data
    monthly_paid_leave = Column(Float, default=24.0) # In Hours
    iqama_expire = Column(String, nullable=True)
    hiring_date = Column(String, nullable=True)
    image_path = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    # Relationship back to User
    user = relationship("User", back_populates="employee_profile")
    payrolls = relationship("MonthlyPayroll", back_populates="employee")
    attendances = relationship("Attendance", back_populates="employee_record")

