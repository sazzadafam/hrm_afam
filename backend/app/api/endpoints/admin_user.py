import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth import get_password_hash, roles_required 
from app.models.attendance import AdjustmentRequest, Attendance, AttendanceLog
from app.models.payroll import MonthlyPayroll
from app.models.user import User
from app.models.employee import Employee
from app.models.role import Role
from fastapi import Form, File, UploadFile


router = APIRouter()


@router.get("/")
def get_all_employees(db: Session = Depends(get_db), current_user = Depends(roles_required(["admin", "read_only_admin"]))):
    users = db.query(User).all()
    results = []
    for user in users:
        p = user.employee_profile 
        results.append({
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_active": user.is_active,
            "employee_id": p.employee_id if p else "",
            "phone": p.phone if p else "",
            "nationality": p.nationality if p else "",
            "iqama_number": p.iqama_number if p else "",
            "iqama_expire": p.iqama_expire if p else "",
            "blood_group": p.blood_group if p else "",
            "dob": p.dob if p else "", 
            "emergency_contact": p.emergency_contact if p else "",
            "department": p.department if p else "",
            "designation": p.designation if p else "",
            "salary": p.salary if p else 0,
            "food_allowance": p.food_allowance if p else 0,
            "conveyance": p.conveyance if p else 0,
            "gross_salary": p.gross_salary if p else 0,
            "duty_hour": p.duty_hour if p else 0,
            "shift_start": p.shift_start if p else "08:00",
            "shift_end": p.shift_end if p else "20:00",
            "image_path": p.image_path if p else None,
        })
    return results
# @router.get("/")
# def get_all_employees(
#     db: Session = Depends(get_db), 
#     current_user = Depends(roles_required(["admin", "read_only_admin"]))
# ):
#     users = db.query(User).all()
    
#     results = []
#     for user in users:
#         profile = user.employee_profile
        
#         results.append({
#             "id": user.id,
#             "name": user.name,
#             "email": user.email,
#             "is_active": user.is_active,
#             "role": user.role.name if user.role else "Staff",
#             "employee_id": profile.employee_id if profile else "N/A",
#             "phone": profile.phone if profile else "",
#             "department": profile.department if profile else "",
#             "designation": profile.designation if profile else "",
#             "salary": profile.salary if profile else 0,
#             "gross_salary": profile.gross_salary if profile else 0,
#             "duty_hour": profile.duty_hour if profile else 0,
#             "shift": f"{profile.shift_start} - {profile.shift_end}" if profile else "",
#             "iqama_number": profile.iqama_number if profile else "",
#             "hiring_date": profile.hiring_date if profile else "",
#             "image_path": profile.image_path if profile else None,
#         })
        
#     return results



@router.post("/")
async def create_employee_and_user(
    employee_id: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    password: str = Form(...),
    iqama_number: Optional[str] = Form(None),
    nationality: Optional[str] = Form(None),
    blood_group: Optional[str] = Form(None),
    dob: Optional[str] = Form(None),
    emergency_contact: Optional[str] = Form(None),
    department: str = Form(...),
    designation: Optional[str] = Form(None),
    shift_start: str = Form("08:00"),
    shift_end: str = Form("20:00"),
    duty_hour: float = Form(...),
    salary: float = Form(0.0),
    food_allowance: float = Form(0.0),
    conveyance: float = Form(0.0),
    gross_salary: float = Form(0.0),
    monthly_paid_leave: float = Form(24.0),
    iqama_expire: Optional[str] = Form(None),
    hiring_date: Optional[str] = Form(None),
    image: UploadFile = File(None),
    
    db: Session = Depends(get_db),
    current_user = Depends(roles_required(["admin"]))
):
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(Employee).filter(Employee.employee_id == employee_id).first():
        raise HTTPException(status_code=400, detail="Employee ID (ZK ID) must be unique")

    role_record = db.query(Role).filter(Role.name == "employee").first()
    new_user = User(
        name=name,
        email=email,
        password_hash=get_password_hash(password),
        role_id=role_record.id if role_record else None,
        is_active=True
    )
    db.add(new_user)
    db.flush() 

    image_url = None
    if image:
        upload_dir = "uploads/profiles"
        os.makedirs(upload_dir, exist_ok=True)
        file_ext = os.path.splitext(image.filename)[1]
        safe_filename = f"{employee_id}{file_ext}"
        file_path = os.path.join(upload_dir, safe_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_url = file_path

    new_employee = Employee(
        user_id=new_user.id,
        employee_id=employee_id,
        phone=phone,
        nationality=nationality,
        iqama_number=iqama_number,
        blood_group=blood_group,
        dob=dob,
        emergency_contact=emergency_contact,
        department=department,
        designation=designation,
        shift_start=shift_start,
        shift_end=shift_end,
        duty_hour=duty_hour,
        salary=salary,
        food_allowance=food_allowance,
        conveyance=conveyance,
        gross_salary=gross_salary,
        monthly_paid_leave=monthly_paid_leave,
        iqama_expire=iqama_expire,
        hiring_date=hiring_date,
        image_path=image_url
    )
    db.add(new_employee)
    
    try:
        db.commit()
        return {"message": "Employee enrolled successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")


@router.put("/{user_id}")
async def update_employee(
    user_id: int,
    name: str = Form(...),
    employee_id: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    nationality: Optional[str] = Form(None),
    iqama_number: Optional[str] = Form(None),
    blood_group: Optional[str] = Form(None),
    dob: Optional[str] = Form(None),
    emergency_contact: Optional[str] = Form(None),
    department: str = Form(None),
    designation: Optional[str] = Form(None),
    shift_start: str = Form("08:00"),
    shift_end: str = Form("20:00"),
    duty_hour: float = Form(12.0), 
    salary: float = Form(0.0),
    food_allowance: float = Form(0.0),
    conveyance: float = Form(0.0),
    gross_salary: float = Form(0.0),
    hiring_date: Optional[str] = Form(None),
    image: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    employee = db.query(Employee).filter(Employee.user_id == user_id).first()
    user = db.query(User).filter(User.id == user_id).first()
    
    if not employee or not user:
        raise HTTPException(status_code=404, detail="Employee or User record not found")

    user.name = name
    user.email = email
    employee.employee_id = employee_id
    employee.phone = phone
    employee.nationality = nationality
    employee.iqama_number = iqama_number
    employee.blood_group = blood_group
    employee.dob = dob
    employee.emergency_contact = emergency_contact
    employee.department = department
    employee.designation = designation
    employee.shift_start = shift_start
    employee.shift_end = shift_end
    employee.duty_hour = duty_hour
    employee.salary = salary
    employee.food_allowance = food_allowance
    employee.conveyance = conveyance
    employee.gross_salary = gross_salary
    employee.hiring_date = hiring_date

    if image:
        upload_dir = "uploads/profiles"
        os.makedirs(upload_dir, exist_ok=True)
        file_ext = os.path.splitext(image.filename)[1]
        safe_filename = f"{employee_id}{file_ext}"
        file_path = os.path.join(upload_dir, safe_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        employee.image_path = file_path

    db.commit()
    return {"message": "Updated successfully", "name": user.name}


@router.delete("/{user_id}")
def deactivate_employee(user_id: int, db: Session = Depends(get_db), current_user = Depends(roles_required(["admin"]))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = False
    
    employee = db.query(Employee).filter(Employee.user_id == user_id).first()
    if employee:
        employee.is_active = False
        
    db.commit()
    return {"message": "Employee and User deactivated"}


@router.get("/archived")
def get_archived_employees(db: Session = Depends(get_db), current_user = Depends(roles_required(["admin", "read_only_admin"]))):
    archived = (
        db.query(Employee)
        .join(User, Employee.user_id == User.id)
        .filter(Employee.is_active == False)
        .all()
    )
    return [
        {
            "id": emp.user.id, # Ensure we use User ID for consistency
            "employee_id": emp.employee_id,
            "name": emp.user.name,
            "email": emp.user.email,
            "department": emp.department,
            "designation": emp.designation
        } for emp in archived

    ]




@router.get("/{user_id}")
def get_employee_details(
    user_id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(roles_required(["admin", "read_only_admin"]))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User record not found")
    
    profile = user.employee_profile
    if not profile:
         raise HTTPException(status_code=404, detail="Employee profile not found")

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "is_active": user.is_active,
        "employee_id": profile.employee_id,
        "phone": profile.phone,
        "nationality": profile.nationality,
        "iqama_number": profile.iqama_number,
        "blood_group": profile.blood_group,
        "dob": profile.dob,
        "emergency_contact": profile.emergency_contact,
        "department": profile.department,
        "designation": profile.designation,
        "shift_start": profile.shift_start,
        "shift_end": profile.shift_end,
        "duty_hour": profile.duty_hour,
        "salary": profile.salary,
        "gross_salary": profile.gross_salary,
        "food_allowance": profile.food_allowance,
        "conveyance": profile.conveyance,
        "hiring_date": profile.hiring_date,
        "image_path": profile.image_path
    }



@router.post("/{user_id}/restore") 
def restore_employee(user_id: int, db: Session = Depends(get_db)):
    # 1. Find the User first
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User record not found")
    
    # 2. Activate the User
    user.is_active = True
    
    # 3. Find and activate the linked Employee Profile
    employee = db.query(Employee).filter(Employee.user_id == user_id).first()
    if employee:
        employee.is_active = True
    
    db.commit()
    return {"message": f"Dossier for {user.name} has been restored."}



@router.delete("/{user_id}/permanent")
def delete_employee_permanently(
    user_id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(roles_required(["admin"]))
):
    db.commit()
    return {"status": "success", "message": "Purged all records."}