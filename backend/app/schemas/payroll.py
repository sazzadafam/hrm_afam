from pydantic import BaseModel
from typing import Dict, Optional


class PayrollResponse(BaseModel):
    employee_id:              str
    name:                     str
    month:                    int
    year:                     int

    # Hours
    total_actual_hours:       float
    total_benefit_hours:      float
    total_paid_leave_hours:   float = 0.0
    penalty_deduction_hours:  float = 0.0
    final_billable_hours:     float

    # Infraction counts
    late_count:               int   = 0
    early_leave_count:        int   = 0

    # Money
    base_salary:              float = 0.0
    hourly_rate_at_time:      float
    gross_salary:             float
    food_allowance:           float = 0.0
    other_allowance:          float = 0.0
    bonus:                    float = 0.0
    deduction:                float = 0.0
    net_salary:               float

    # Meta
    duty_hour:                float = 0.0
    standard_monthly_hours:   float = 0.0
    status:                   str   = "draft"

    class Config:
        from_attributes = True













# from pydantic import BaseModel
# from typing import Optional, Dict, Any

# class PayrollResponse(BaseModel):
#     employee_id: str
#     name: str
#     month: int
#     year: int
#     total_actual_hours: float
#     total_benefit_hours: float
#     total_paid_leave_hours: float
#     penalty_deduction_hours: float
#     final_billable_hours: float
#     hourly_rate_at_time: float
#     base_salary: float
#     gross_salary: float
#     net_salary: float
#     late_count: int
#     early_leave_count: int
#     status: str
#     duty_hour: float
#     food_allowance: float
#     other_allowance: float
#     bonus: float
#     deduction: float
#     weekly_breakdown: Optional[Dict[str, Any]] = None