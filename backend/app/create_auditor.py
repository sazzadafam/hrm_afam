import sys
import os

# Ensure the root directory is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.core.auth import get_password_hash 

# --- CRITICAL: IMPORT ALL MODELS TO SATISFY SQLALCHEMY MAPPER ---
try:
    from app.models.user import User
    from app.models.role import Role
    from app.models.employee import Employee
    from app.models.attendance import Attendance
    # The missing link in your last error:
    from app.models.payroll import MonthlyPayroll 
    # If you have others like Bonus, Leave, etc., add them here:
    # from app.models.bonus import Bonus
except ImportError as e:
    print(f"Note: Some models could not be imported individually: {e}")
    # Fallback: If you have an __init__.py that exports everything:
    # from app.models import * # --------------------------------------------------------------

def create_read_only_user():
    db = SessionLocal()
    try:
        # 1. Ensure the "read_only_admin" role exists
        role_name = "read_only_admin"
        role = db.query(Role).filter(Role.name == role_name).first()
        
        if not role:
            print(f"Role '{role_name}' not found. Creating it...")
            role = Role(name=role_name)
            db.add(role)
            db.commit()
            db.refresh(role)

        # 2. Setup Auditor Credentials
        AUDITOR_EMAIL = "auditor@afam-group.com"
        AUDITOR_PASSWORD = "AuditPassword2026!"

        # 3. Check for existing user
        exists = db.query(User).filter(User.email == AUDITOR_EMAIL).first()
        if exists:
            print(f"User {AUDITOR_EMAIL} already exists.")
            return

        # 4. Create User
        new_user = User(
            name="System Auditor",
            email=AUDITOR_EMAIL,
            password_hash=get_password_hash(AUDITOR_PASSWORD),
            role_id=role.id,
            is_active=True
        )

        db.add(new_user)
        db.commit()
        
        print(f"\n✅ SUCCESS: Auditor Created")
        print(f"📧 Email: {AUDITOR_EMAIL}")
        print(f"🔑 Password: {AUDITOR_PASSWORD}")
        print(f"🛡️ Role: {role_name} (ID: {role.id})")

    except Exception as e:
        print(f"❌ Error occurred: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_read_only_user()
