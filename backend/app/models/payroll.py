from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime

class MonthlyPayroll(Base):
    __tablename__ = "monthly_payroll"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)    
    month = Column(Integer, nullable=False) 
    year = Column(Integer, nullable=False)  
    
    # Hours Tracking
    total_actual_hours = Column(Float, default=0.0)   
    total_benefit_hours = Column(Float, default=0.0) # The 6h/week grace
    total_paid_leave_hours = Column(Float, default=0.0) # From Employee Profile
    penalty_deduction_hours = Column(Float, default=0.0) # From 3-late rule
    final_billable_hours = Column(Float, default=0.0)  
    
    # Financials
    hourly_rate_at_time = Column(Float, nullable=False) 
    gross_salary = Column(Float, nullable=False)        
    net_salary = Column(Float, nullable=False)
    
    # Adjustments
    food_allowance = Column(Float, default=0.0)              
    other_allowance = Column(Float, default=0.0)
    bonus = Column(Float, default=0.0)
    deduction = Column(Float, default=0.0)
    
    # Metadata
    status = Column(String(20), default="draft")      
    generated_at = Column(DateTime, default=datetime.utcnow)
    
    weekly_breakdown = Column(JSON, nullable=True)
    employee = relationship("Employee", back_populates="payrolls")
    
    
    







# from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
# from sqlalchemy.orm import relationship
# from app.core.database import Base
# from datetime import datetime


# class MonthlyPayroll(Base):
#     __tablename__ = "monthly_payroll"

#     id = Column(Integer, primary_key=True, index=True)
#     employee_id = Column(String(50), ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)    
#     month = Column(Integer, nullable=False) 
#     year = Column(Integer, nullable=False)  
#     total_actual_hours = Column(Float, default=0.0)   
#     total_benefit_hours = Column(Float, default=0.0)   
#     final_billable_hours = Column(Float, default=0.0)  
#     hourly_rate_at_time = Column(Float, nullable=False) 
#     gross_salary = Column(Float, nullable=False)        
#     net_salary = Column(Float, nullable=False)
#     food_allowance = Column(Float, default=0.0)              
#     other_allowance = Column(Float, default=0.0)
#     bonus = Column(Float, default=0.0)
#     deduction = Column(Float, default=0.0)
#     status = Column(String(20), default="draft")      
#     generated_at = Column(DateTime, default=datetime.utcnow)
#     paid_at = Column(DateTime, nullable=True)
    
#     weekly_breakdown = Column(JSON, nullable=True)      # Stores: {"W1": 78, "W2": 80...}
#     employee = relationship("Employee", back_populates="payrolls")
