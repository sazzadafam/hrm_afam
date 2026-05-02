# routers/adms.py
from datetime import datetime

from fastapi import APIRouter, Request, Response, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.attendance import Attendance, AttendanceLog
# Note: We do NOT use a prefix here because the ZK machine 
# hardcodes the "/iclock/" path into its firmware.
router = APIRouter(tags=["Biometric Hardware"])

last_punch_records = {}
@router.get("/iclock/cdata")
async def machine_handshake(SN: str = None):
    """Step 1: Machine asks if server is alive"""
    print(f"📡 Handshake from Machine SN: {SN}")
    return Response(content="OK", media_type="text/plain")

@router.post("/iclock/cdata")
async def receive_attendance_data(request: Request, SN: str = None, db: Session = Depends(get_db)):
    """Step 2: Machine pushes fingerprint scans"""
    raw_data = await request.body()
    data_str = raw_data.decode('utf-8')
    log_lines = data_str.strip().split("\n")
    
    for line in log_lines:
        if not line.strip(): continue
        
        parts = line.split()
        if len(parts) >= 3:
            machine_user_id = parts[0]
            exact_timestamp = f"{parts[1]} {parts[2]}"
            
            # --- 1. Double-Tap Protection ---
            if machine_user_id in last_punch_records and last_punch_records[machine_user_id] == exact_timestamp:
                continue 
            last_punch_records[machine_user_id] = exact_timestamp
            
            # --- 2. Database Insertion ---
            try:
                # Convert the text "2026-04-19 14:30:00" into a Python datetime object
                punch_dt = datetime.strptime(exact_timestamp, "%Y-%m-%d %H:%M:%S")
                
                # Create the raw log entry
                new_log = AttendanceLog(
                    employee_id=str(machine_user_id), 
                    timestamp=punch_dt,
                    source=f"MB10_{SN}" if SN else "MB10_Hara",
                    status="pending",
                    # Note: We leave 'type' empty or handle it later in your attendance processing logic, 
                    # as MB10 scans are often just generic punches without IN/OUT buttons pressed.
                )
                
                db.add(new_log)
                db.commit()
                print(f"✅ Saved DB Log: Employee {machine_user_id} @ {exact_timestamp}")
                
            except Exception as e:
                db.rollback()
                print(f"❌ DB Error for user {machine_user_id}: {e}")

    # Must return OK so the machine deletes the log from its physical memory
    return Response(content="OK", media_type="text/plain")

@router.get("/iclock/getrequest")
async def check_server_commands(SN: str = None):
    """Step 3: Machine checks for commands"""
    return Response(content="OK", media_type="text/plain")