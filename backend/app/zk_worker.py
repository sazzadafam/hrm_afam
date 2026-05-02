import os
import time
import threading
import requests
from zk import ZK
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

# Configuration from .env
# Make sure ZK_MACHINES=192.168.100.230,192.168.100.231
MACHINE_IPS = [ip.strip() for ip in os.getenv("ZK_MACHINES", "").split(",") if ip.strip()]
PORT = int(os.getenv("ZK_PORT", 4370))
SERVER_URL = os.getenv("BACKEND_SERVER_URL")

def listen_to_machine(ip):
    zk = ZK(ip, port=PORT, timeout=5, force_udp=False)
    conn = None
    processed_log_ids = set() # Keeps track of logs handled in this session

    print(f"[*] [System] Thread initialized for Machine: {ip}")

    while True:
        try:
            if not conn:
                print(f"[*] [Attempting Connection] --> {ip}...")
                conn = zk.connect()
                print(f"✅ [Connected] Machine: {ip}")
                
                # Initial Load: Mark existing logs as 'processed' so we don't 
                # sync old data from previous days when the script starts.
                initial_logs = conn.get_attendance()
                for log in initial_logs:
                    processed_log_ids.add(f"{log.user_id}_{log.timestamp}")
                print(f"📡 [Monitoring] {ip} is live. Ignoring {len(initial_logs)} old logs.")

            # --- THE POLLING LOOP ---
            while True:
                current_logs = conn.get_attendance()
                
                for log in current_logs:
                    # 🚀 SKIP ADMIN/SYSTEM USER ID 1
                    if str(log.user_id) == "1":
                        continue
                        
                    log_key = f"{log.user_id}_{log.timestamp}"
                    
                    # If this is a new log we haven't seen yet
                    if log_key not in processed_log_ids:
                        # Format the time for the console output
                        punch_time = log.timestamp.strftime('%I:%M:%S %p')
                        
                        print(f"\n🔔 [NEW PUNCH] Source: {ip} | User: {log.user_id} | Time: {punch_time}")
                        
                        payload = {
                            "employee_id": str(log.user_id),
                            "timestamp": log.timestamp.isoformat()
                        }

                        try:
                            # Sending to FastAPI Backend
                            res = requests.post(SERVER_URL, params=payload, timeout=5)
                            if res.status_code == 200:
                                print(f"   🚀 [Sync] {ip} -> Backend OK @ {punch_time}")
                                processed_log_ids.add(log_key)
                            else:
                                # This handles the 'Employee Not Found' (400) or other errors
                                print(f"   ⚠️ [Server Error] {res.status_code}: {res.text}")
                        except Exception as e:
                            print(f"   ❌ [Backend Unreachable] {e}")

                time.sleep(3) # Check for new fingers every 3 seconds

        except Exception as e:
            print(f"🔴 [Offline/Error] Machine {ip}: {str(e)}")
            conn = None
            print(f"   Retrying {ip} in 10 seconds...")
            time.sleep(10)

if __name__ == "__main__":
    print(f"\n{'='*50}")
    print(f"--- AFAM HRM POLLING MONITOR STARTING ---")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    if not MACHINE_IPS:
        print("❌ ERROR: No IPs found in ZK_MACHINES env variable!")
    else:
        print(f"Targeting Machines: {', '.join(MACHINE_IPS)}")
        
        threads = []
        for ip in MACHINE_IPS:
            t = threading.Thread(target=listen_to_machine, args=(ip,), daemon=True)
            t.start()
            threads.append(t)

        try:
            while True:
                # Keep the main thread alive
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[System] Shutting down gracefully...")

