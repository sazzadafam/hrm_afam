import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session 
from app.core.database import get_db, engine, Base 
from app.models.user import User
from app.models.role import Role 
from app.models.department import Department 
from app.core.auth import get_password_hash 
from fastapi.staticfiles import StaticFiles

# Router imports - admin_action is removed as it is now merged into attendance
from app.api.endpoints import ( auth, admin_user, employee_self, events, attendance, admin_payroll, departments, adms )

# 1. Database Table Creation
Base.metadata.create_all(bind=engine)

# 2. Ensure Upload Directories Exist
for path in ["uploads/profiles", "uploads/medical"]: 
    os.makedirs(path, exist_ok=True)

app = FastAPI(title="AFAM Group HRM API", version="2.0.0")

# 3. Static Files Configuration
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# 4. Middleware (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. Modular Router Registration

# --- Authentication & Profiles ---
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# app.include_router(employee_self.router, prefix="/employee", tags=["Employee - Self Service"])

# --- Unified Attendance System ---
# This single router now handles ZK Sync, Admin Dashboards, and Archives
app.include_router(attendance.router, prefix="/attendance", tags=["Attendance System"])

# --- Biometric Hardware Sync (ZK ADMS) ---

app.include_router(adms.router)

# --- Department Management (Settings) ---
app.include_router(departments.router, prefix="/departments", tags=["Settings - Departments"])

# --- Admin Management ---
app.include_router(admin_user.router, prefix="/admin/users", tags=["Admin - User Management"])
app.include_router(admin_payroll.router, prefix="/admin/payroll", tags=["Admin - Payroll"])
app.include_router(events.router, prefix="/events", tags=["Events & Announcements"])
app.include_router(attendance.router, prefix="/admin/actions/attendance", tags=["Admin - Attendance UI"])
app.include_router(attendance.router, prefix="/admin/actions", tags=["Admin - Management Actions"])


@app.get("/")
def read_root():
    return {
        "status": "online",
        "system": "AFAM HRM 24/7",
        "message": "Backend API is active and healthy."
    }

@app.post("/setup-system", tags=["System Setup"])
def setup_system(db: Session = Depends(get_db)):
    # --- Create Roles ---
    roles_to_create = ["admin", "read_only_admin", "staff"]
    created_roles = {}
    
    for r_name in roles_to_create:
        role = db.query(Role).filter(Role.name == r_name).first()
        if not role:
            role = Role(name=r_name)
            db.add(role)
            db.commit()
            db.refresh(role)
        created_roles[r_name] = role

    # --- Create Initial Super Admin ---
    admin_exists = db.query(User).filter(User.email == "admin@afam-group.com").first()
    if not admin_exists:
        new_admin = User(
            email="admin@afam-group.com",
            password_hash=get_password_hash("Admin@2026"),
            name="Master Admin",
            role_id=created_roles["admin"].id 
        )
        db.add(new_admin)
        
    # --- Create Initial Auditor ---
    auditor_exists = db.query(User).filter(User.email == "auditor@afam-group.com").first()
    if not auditor_exists:
        new_auditor = User(
            email="auditor@afam-group.com",
            password_hash=get_password_hash("AuditPassword2026!"),
            name="System Auditor",
            role_id=created_roles["read_only_admin"].id 
        )
        db.add(new_auditor)

    try:
        db.commit()
        return {
            "msg": "System setup complete",
            "roles": roles_to_create,
            "admin_account": "admin@afam-group.com",
            "auditor_account": "auditor@afam-group.com"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Setup failed: {str(e)}")
