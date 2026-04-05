# # app/api/leaves.py
# import shutil
# from pathlib import Path
# from fastapi import APIRouter, UploadFile, File, Form, Depends
# from app.models import LeaveRequest
# from app.core.auth import get_current_user, role_required


# router = APIRouter()
# UPLOAD_DIR = Path("uploads/medical_reports")

# @router.post("/request-leave")
# async def create_leave_request(
#     leave_type: str = Form(...),
#     start_date: str = Form(...),
#     medical_report: UploadFile = File(None), # Optional unless medical
#     user = Depends(get_current_user)
# ):
#     file_path = None
#     if leave_type == "medical" and medical_report:
#         UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
#         file_path = UPLOAD_DIR / f"{user.id}_{medical_report.filename}"
#         with file_path.open("wb") as buffer:
#             shutil.copyfileobj(medical_report.file, buffer)

#     # Save to PostgreSQL
#     new_leave = LeaveRequest(
#         user_id=user.id,
#         leave_type=leave_type,
#         attachment_url=str(file_path) if file_path else None,
#         status="pending"
#     )
#     # ... add to DB and commit
#     return {"status": "success", "message": "Leave request submitted"}