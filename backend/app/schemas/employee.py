from pydantic import BaseModel
from typing import Optional
from datetime import date

class EmployeeBase(BaseModel):
    employee_id: str
    phone: str
    nationality: Optional[str] = None
    iqama_number: Optional[str] = None
    blood_group: Optional[str] = None
    dob: Optional[str] = None
    emergency_contact: Optional[str] = None
    department: str
    designation: Optional[str] = None
    shift_start: str = "08:00"
    shift_end: str = "20:00"
    duty_hour: float
    salary: float
    food_allowance: float
    conveyance: float
    gross_salary: float
    monthly_paid_leave: float
    iqama_expire: Optional[str] = None
    hiring_date: Optional[str] = None
    image_path: Optional[str] = None
    is_active: bool = True

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeOut(EmployeeBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True