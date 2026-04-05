import os
import importlib
import pkgutil
from zk import ZK
from dotenv import load_dotenv
from app.core.database import SessionLocal
import app.models  # Ensure the models package is available

load_dotenv()

def load_all_models():
    """
    Dynamically imports all modules in the app.models package.
    This resolves SQLAlchemy 'failed to locate a name' errors.
    """
    path = os.path.dirname(app.models.__file__)
    for _, name, is_pkg in pkgutil.iter_modules([path]):
        full_module_name = f"app.models.{name}"
        importlib.import_module(full_module_name)
    print("✅ All database models loaded and relationships mapped.")

def push_db_employees_to_zk():
    # 1. Configuration
    raw_ips = os.getenv("ZK_MACHINES", "192.168.100.230,192.168.100.231")
    machine_ips = [ip.strip() for ip in raw_ips.split(",") if ip.strip()]
    zk_port = int(os.getenv("ZK_MACHINE_PORT", 4370))
    
    # 2. Load all models to satisfy MonthlyPayroll, Attendance, etc.
    load_all_models()
    
    # Now safe to import specific classes
    from app.models.employee import Employee

    db = SessionLocal()
    
    try:
        print(f"--- AFAM Employee Sync: Fetching from DB ---")
        # Fetching employees (this will now work because Payroll/Attendance are loaded)
        employees = db.query(Employee).filter(Employee.is_active == True).all()
        
        if not employees:
            print("No active employees found in database.")
            return

        print(f"Found {len(employees)} users. Starting Sync for {len(machine_ips)} machines...")

        for ip in machine_ips:
            zk = ZK(ip, port=zk_port, timeout=8)
            conn = None
            
            try:
                print(f"\n📡 Connecting to Machine: {ip}...")
                conn = zk.connect()
                conn.disable_device() 
                
                print(f"✅ Connected! Pushing names...")
                
                for emp in employees:
                    # Use emp.user.name (loaded via relationship)
                    name_to_display = emp.user.name[:24] 
                    
                    conn.set_user(
                        uid=emp.id, 
                        name=name_to_display, 
                        privilege=0, 
                        user_id=str(emp.employee_id)
                    )
                
                print(f"🏁 Sync complete for {ip}")
                conn.test_voice() 
                conn.enable_device()
                
            except Exception as e:
                print(f"❌ Machine {ip} Error: {e}")
            finally:
                if conn:
                    conn.disconnect()
        
    except Exception as e:
        print(f"❌ System Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    push_db_employees_to_zk()
