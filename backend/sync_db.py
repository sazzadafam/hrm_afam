from app.core.database import engine
from sqlalchemy import text

def populate_defaults():
    with engine.connect() as conn:
        print("🛠️  Populating default values for empty fields...")
        # This sets a default for any row where the value is currently NULL
        conn.execute(text("""
            UPDATE employees SET 
                shift_start = COALESCE(shift_start, '08:00'),
                shift_end = COALESCE(shift_end, '20:00'),
                dob = COALESCE(dob, '1990-01-01'),
                hiring_date = COALESCE(hiring_date, '2024-01-01'),
                nationality = COALESCE(nationality, 'Not Specified'),
                blood_group = COALESCE(blood_group, 'Unknown')
            WHERE shift_start IS NULL 
               OR dob IS NULL 
               OR shift_end IS NULL;
        """))
        conn.commit()
        print("✅ Database defaults applied. Your frontend should now open the edit modal!")

if __name__ == "__main__":
    populate_defaults()










# # sync_db.py
# from app.core.database import engine  # Updated path
# from sqlalchemy import text

# def sync_database():
#     new_columns = [
#         ("nationality", "VARCHAR"),
#         ("iqama_number", "VARCHAR"),
#         ("blood_group", "VARCHAR"),
#         ("dob", "VARCHAR"),
#         ("emergency_contact", "VARCHAR"),
#         ("shift_start", "VARCHAR DEFAULT '08:00'"),
#         ("shift_end", "VARCHAR DEFAULT '20:00'"),
#         ("food_allowance", "FLOAT DEFAULT 0"),
#         ("conveyance", "FLOAT DEFAULT 0"),
#         ("gross_salary", "FLOAT DEFAULT 0"),
#         ("iqama_expire", "VARCHAR"),
#         ("hiring_date", "VARCHAR")
#     ]

#     with engine.connect() as conn:
#         print("🔍 Scanning for missing columns in 'employees' table...")
#         for col_name, col_type in new_columns:
#             try:
#                 conn.execute(text(f"ALTER TABLE employees ADD COLUMN {col_name} {col_type}"))
#                 conn.commit()
#                 print(f"✅ Successfully added: {col_name}")
#             except Exception as e:
#                 conn.rollback()
#                 if "already exists" in str(e):
#                     print(f"ℹ️  {col_name} already exists. Skipping...")
#                 else:
#                     print(f"❌ Error adding {col_name}: {e}")
        
#         print("\n✨ Database columns synchronized!")

# if __name__ == "__main__":
#     sync_database()