from pydantic import BaseModel
from datetime import date
from typing import Optional

class LeaveRequestBase(BaseModel):
    leave_type: str  
    start_date: date
    end_date: date
    reason: Optional[str] = None

class LeaveRequestCreate(LeaveRequestBase):
    pass 
class LeaveRequestOut(LeaveRequestBase):
    id: int
    user_id: int
    status: str
    medical_report_url: Optional[str] = None

    class Config:
        from_attributes = True 