# from fastapi import APIRouter, Depends, HTTPException
# from sqlalchemy.orm import Session
# from typing import List
# from app.models.leave import LeaveRequest
# from app.models.employee import Employee
# from app.core.database import get_db
# from app.api import deps
# from app.models.user import User

# router = APIRouter()

# @router.get("/admin/leave/pending")
# async def get_all_pending_leaves(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_admin) # Ensure only Admin access
# ):
#     # Fetch requests and join with Employee/User to show names on the Admin dashboard
#     requests = (
#         db.query(LeaveRequest)
#         .filter(LeaveRequest.status == "pending")
#         .all()
#     )
#     return requests

# @router.patch("/admin/leave/{request_id}/approve")
# async def update_leave_status(
#     request_id: int,
#     status: str, # "approved" or "rejected"
#     db: Session = Depends(get_db),
#     current_user: User = Depends(deps.get_current_active_admin)
# ):
#     leave_req = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
#     if not leave_req:
#         raise HTTPException(status_code=404, detail="Request not found")

#     if status not in ["approved", "rejected"]:
#         raise HTTPException(status_code=400, detail="Invalid status")

#     leave_req.status = status
#     db.commit()
    
#     # Optional: Send WebSocket notification to the specific user
#     # await emp_notification_manager.send_personal_message(
#     #     leave_req.user_id, 
#     #     {"type": "LEAVE_UPDATE", "message": f"Your leave was {status}"}
#     # )

#     return {"message": f"Leave request {status} successfully"}