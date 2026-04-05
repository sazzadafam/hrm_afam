from pydantic import BaseModel
from datetime import datetime
from typing import Literal

class ManualEntryCreate(BaseModel):
    employee_id: str
    timestamp: datetime
    type: Literal['IN', 'OUT']

class AttendanceResponse(BaseModel):
    id: int
    employee_id: str
    timestamp: datetime
    type: str
    source: str

    class Config:
        from_attributes = True