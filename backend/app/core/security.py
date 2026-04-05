from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext

# Secret key to sign your JWT - keep this private!
SECRET_KEY = "987asdf897asdf897asdf_EXAMPLE_KEY"
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# def create_access_token(data: dict):
#     to_encode = data.copy()
#     expire = datetime.utcnow() + timedelta(hours=24)
#     to_encode.update({"exp": expire})
#     return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
        
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)