from pydantic import BaseModel, EmailStr
from typing import Optional, List
from .employee import EmployeeOut # Import the schema we just made

class UserBase(BaseModel):
    name: str
    email: EmailStr
    is_active: bool = True

class UserCreate(UserBase):
    password: str
    role_id: int

class UserOut(UserBase):
    id: int
    role_id: Optional[int]
    # This connects the profile data to the User object
    employee_profile: Optional[EmployeeOut] = None 

    class Config:
        from_attributes = True