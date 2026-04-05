# app/schemas/payroll.py
from pydantic import BaseModel
from typing import Optional

class PayrollResponse(BaseModel):
    employee_id: str
    name: str
    benefit: str
    monthly_goal: float
    actual_hours: float
    estimated_payout: float
    net_salary: float
    status: str
    late_count: int
    early_leave_count: int
    total_paid_leave_hours: float
    
    # Add these if you want to keep them in the schema but make them optional
    # or remove them from the schema if you don't plan to send them.
    month: Optional[int] = None
    year: Optional[int] = None

















# from pydantic import BaseModel
# from typing import Dict, List, Optional

# class PayrollResponse(BaseModel):
#     employee_id: str
#     name: str
#     month: int
#     year: int
#     total_actual_hours: float
#     total_benefit_hours: float
#     final_billable_hours: float
#     hourly_rate_at_time: float
#     gross_salary: float
#     food_allowance: float = 0.0
#     other_allowance: float = 0.0
#     bonus: float = 0.0
#     deduction: float = 0.0
#     net_salary: float
#     weekly_breakdown: Dict[str, float]

#     class Config:
#         from_attributes = True




