from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class MonthlyPayroll(Base):
    __tablename__ = "monthly_payroll"

    id                       = Column(Integer, primary_key=True, index=True)
    employee_id              = Column(String(50), ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)
    month                    = Column(Integer, nullable=False)
    year                     = Column(Integer, nullable=False)

    total_actual_hours       = Column(Float, default=0.0)
    total_benefit_hours      = Column(Float, default=0.0)
    penalty_deduction_hours  = Column(Float, default=0.0)   
    final_billable_hours     = Column(Float, default=0.0)

    late_count               = Column(Integer, default=0)   
    early_leave_count        = Column(Integer, default=0)   

    base_salary              = Column(Float, default=0.0)   
    base_salary_at_time      = Column(Float, nullable=False, default=0.0)
    hourly_rate_at_time      = Column(Float, nullable=False, default=0.0)
    gross_salary             = Column(Float, nullable=False, default=0.0)
    food_allowance           = Column(Float, default=0.0)
    other_allowance          = Column(Float, default=0.0)
    bonus                    = Column(Float, default=0.0)
    deduction                = Column(Float, default=0.0)
    net_salary               = Column(Float, nullable=False, default=0.0)

    status                   = Column(String(20), default="draft")
    generated_at             = Column(DateTime, default=datetime.utcnow)
    paid_at                  = Column(DateTime, nullable=True)
    weekly_breakdown         = Column(JSON, nullable=True)

    employee = relationship("Employee", back_populates="payrolls")

