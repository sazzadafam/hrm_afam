from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.department import Department
from pydantic import BaseModel

router = APIRouter()

class DeptSchema(BaseModel):
    name: str

@router.get("/")
def get_depts(db: Session = Depends(get_db)):
    return db.query(Department).all()

@router.post("/")
def add_dept(dept: DeptSchema, db: Session = Depends(get_db)):
    new_dept = Department(name=dept.name)
    db.add(new_dept)
    db.commit()
    db.refresh(new_dept)
    return new_dept

@router.delete("/{dept_id}")
def delete_dept(dept_id: int, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if dept:
        db.delete(dept)
        db.commit()
    return {"status": "deleted"}