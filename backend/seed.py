# backend/seed.py
import psycopg2
from passlib.context import CryptContext
from dotenv import load_dotenv
import os

load_dotenv()

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_database():
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()

    try:
        # 1. Create Tables
        print("Creating/Updating tables...")
        sql_schema = """
        CREATE TABLE IF NOT EXISTS roles (
            id SERIAL PRIMARY KEY,
            name VARCHAR(20) UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role_id INTEGER REFERENCES roles(id),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            employee_id VARCHAR(50) UNIQUE NOT NULL,
            phone VARCHAR(20),
            nationality VARCHAR(50),
            designation VARCHAR(100),
            department VARCHAR(100),
            salary NUMERIC(10, 2),
            duty_hour INTEGER DEFAULT 8,
            payment_type VARCHAR(50) DEFAULT 'Bank Transfer',
            hiring_date DATE,
            iqama_number VARCHAR(50),
            iqama_expire DATE,
            image_path TEXT
        );
        """
        cur.execute(sql_schema)

        # 2. Insert Roles
        print("Inserting roles...")
        roles = ['super_admin', 'admin', 'employee']
        for role in roles:
            cur.execute("INSERT INTO roles (name) ON CONFLICT (name) DO NOTHING VALUES (%s)", (role,))

        # 3. Create Super Admin
        print("Creating Super Admin account...")
        email = "admin@hrm.com"
        password = "adminpassword123"
        hashed_pw = pwd_context.hash(password)
        
        # Get super_admin role ID
        cur.execute("SELECT id FROM roles WHERE name = 'super_admin'")
        role_id = cur.fetchone()[0]

        cur.execute("""
            INSERT INTO users (name, email, password_hash, role_id, is_active)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (email) DO NOTHING
        """, ("Head Office Admin", email, hashed_pw, role_id, True))

        conn.commit()
        print("✅ Database seeded successfully!")
        print(f"Login with: {email} / {password}")

    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    seed_database()