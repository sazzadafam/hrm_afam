import os
import sys
import importlib
import pkgutil
from zk import ZK
from dotenv import load_dotenv
from app.core.database import SessionLocal
import app.models 

load_dotenv()

def load_all_models():
    path = os.path.dirname(app.models.__file__)
    for _, name, is_pkg in pkgutil.iter_modules([path]):
        full_module_name = f"app.models.{name}"
        importlib.import_module(full_module_name)

def push_single_to_zk(target_employee_id):
    # 1. Configuration
    raw_ips = os.getenv("ZK_MACHINES", "192.168.100.230,192.168.100.231")
    machine_ips = [ip.strip() for ip in raw_ips.split(",") if ip.strip()]
    zk_port = int(os.getenv("ZK_MACHINE_PORT", 4370))
    
    load_all_models()
    from app.models.employee import Employee

    db = SessionLocal()
    
    try:
        # 2. Find the specific employee
        emp = db.query(Employee).filter(Employee.employee_id == target_employee_id).first()
        
        if not emp:
            print(f"❌ Error: Employee with ID '{target_employee_id}' not found in database.")
            return

        name_to_display = emp.user.name[:24]
        print(f"--- AFAM Single Push: {name_to_display} (ID: {emp.employee_id}) ---")

        for ip in machine_ips:
            zk = ZK(ip, port=zk_port, timeout=8)
            conn = None
            
            try:
                print(f"📡 Connecting to {ip}...")
                conn = zk.connect()
                
                # Push only this user
                conn.set_user(
                    uid=emp.id, 
                    name=name_to_display, 
                    privilege=0, 
                    user_id=str(emp.employee_id)
                )
                
                print(f"✅ Success: {name_to_display} synced to {ip}")
                conn.test_voice() 
                
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
    # Check if user provided an ID in the command line
    if len(sys.argv) > 1:
        emp_id = sys.argv[1]
        push_single_to_zk(emp_id)
    else:
        print("Usage: python -m app.push_single_employee <employee_id>")
        print("Example: python -m app.push_single_employee EMP001")