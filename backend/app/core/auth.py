import os
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session, joinedload
from dotenv import load_dotenv
from app.core.database import get_db
from app.models.user import User

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "987asdf897asdf897asdf_EXAMPLE_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# --- PASSWORD UTILS ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# --- TOKEN GENERATION ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- DEPENDENCIES ---

async def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # Optimized query: joinedload('role') ensures the role info is fetched in one go
    user = db.query(User).options(joinedload(User.role)).filter(User.email == email).first()
    
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="User account is inactive"
        )
    return current_user

# --- ENHANCED ROLE-BASED ACCESS CONTROL (RBAC) ---

def roles_required(allowed_roles: List[str]):
    """
    Advanced dependency factory. 
    Usage: Depends(roles_required(["admin", "read_only_admin"]))
    Allows any of the specified roles or 'super_admin' to access.
    """
    async def role_checker(current_user: User = Depends(get_current_active_user)):
        if not current_user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User has no role assigned"
            )
        
        user_role_name = current_user.role.name.lower()
        
        # Always allow super_admin, otherwise check if user's role is in the allowed list
        if user_role_name == 'super_admin':
            return current_user
            
        if user_role_name not in [role.lower() for role in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Insufficient permissions for this action"
            )
        return current_user
    return role_checker

# Legacy helper for single role checks
def role_required(required_role: str):
    return roles_required([required_role])











# import os
# from datetime import datetime, timedelta
# from typing import Optional
# from fastapi import Depends, HTTPException, status
# from fastapi.security import OAuth2PasswordBearer
# from jose import JWTError, jwt
# from passlib.context import CryptContext
# from sqlalchemy.orm import Session
# from dotenv import load_dotenv
# from app.core.database import get_db
# from app.models.user import User

# load_dotenv()

# # Using a consistent key is critical. If this changes, all old tokens become invalid (401).
# SECRET_KEY = os.getenv("SECRET_KEY", "987asdf897asdf897asdf_EXAMPLE_KEY")
# ALGORITHM = "HS256"
# ACCESS_TOKEN_EXPIRE_MINUTES = 480 

# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# # This tells FastAPI where to look for the token and which endpoint handles login
# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# # --- PASSWORD UTILS ---
# def verify_password(plain_password, hashed_password):
#     return pwd_context.verify(plain_password, hashed_password)

# def get_password_hash(password):
#     return pwd_context.hash(password)

# # --- TOKEN GENERATION ---
# def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
#     to_encode = data.copy()
#     # Use the provided delta or fall back to our 480-minute default
#     if expires_delta:
#         expire = datetime.utcnow() + expires_delta
#     else:
#         expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
#     to_encode.update({"exp": expire})
#     encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
#     return encoded_jwt

# # --- DEPENDENCIES ---

# async def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
#     credentials_exception = HTTPException(
#         status_code=status.HTTP_401_UNAUTHORIZED,
#         detail="Could not validate credentials",
#         headers={"WWW-Authenticate": "Bearer"},
#     )
#     try:
#         # Decode the JWT
#         payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
#         # "sub" is the standard claim for the user identity (email)
#         email: str = payload.get("sub")
#         if email is None:
#             raise credentials_exception
#     except JWTError:
#         raise credentials_exception
        
#     # Fetch the user from the database
#     user = db.query(User).filter(User.email == email).first()
#     if user is None:
#         raise credentials_exception
#     return user

# async def get_current_active_user(current_user: User = Depends(get_current_user)):
#     if not current_user.is_active:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST, 
#             detail="User account is inactive"
#         )
#     return current_user

# def role_required(required_role: str):
#     """
#     Dependency factory to enforce role-based access control.
#     Supports specific roles and allows 'super_admin' to bypass all checks.
#     """
#     async def role_checker(current_user: User = Depends(get_current_active_user)):
#         # 1. Check if user has a role assigned at all
#         if not current_user.role:
#             raise HTTPException(
#                 status_code=status.HTTP_403_FORBIDDEN,
#                 detail="User has no role assigned"
#             )
        
#         # 2. Check if user is super_admin (Master Key) or matches required_role
#         user_role_name = current_user.role.name.lower()
#         if user_role_name != required_role.lower() and user_role_name != 'super_admin':
#             raise HTTPException(
#                 status_code=status.HTTP_403_FORBIDDEN, 
#                 detail=f"Access denied: {required_role} permissions required"
#             )
#         return current_user
#     return role_checker