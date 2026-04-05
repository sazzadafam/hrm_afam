# backend/get_machine_token.py
import sys
import os

# This line ensures Python can find your 'app' folder
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.security import create_access_token
from datetime import timedelta

# Data to encode in the token
token_data = {
    "sub": "admin@example.com", # Change this to your real admin email from your DB
    "role": "admin"
}

# Generate a token valid for 1 year
long_token = create_access_token(data=token_data, expires_delta=timedelta(days=365))

print("\n" + "="*50)
print("YOUR ADMIN_JWT_TOKEN IS BELOW:")
print("="*50 + "\n")
print(long_token)
print("\n" + "="*50)