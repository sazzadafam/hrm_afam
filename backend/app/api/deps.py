# app/api/deps.py
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.core.auth import get_current_user, role_required

# --- Dependency for DB session ---
def get_db_session() -> Session:
    """
    Provide a database session to endpoints
    """
    return Depends(get_db)

# --- Dependency for current user ---
def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Ensures the user is authenticated and active
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not authenticated"
        )
    return current_user

# --- Dependency for admin role ---
def admin_user(current_user: User = Depends(get_current_active_user)):
    """
    Ensures the user has admin privileges
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user

# You can add more shared dependencies here

# 1. Broad access: Allows both Super Admin AND Read-Only Admin
def any_admin_user(current_user: User = Depends(get_current_active_user)):
    """
    Allows 'admin' (Super Admin) and 'read_only_admin' to view data.
    """
    if current_user.role not in ["admin", "read_only_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Auditor privileges required"
        )
    return current_user

# 2. Restricted access: Only the original Super Admin can "Write/POST/DELETE"
def super_admin_only(current_user: User = Depends(get_current_active_user)):
    """
    Strictly ensures the user is the main 'admin'.
    Use this for POST, PUT, DELETE endpoints.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write access denied. Super Admin role required."
        )
    return current_user


