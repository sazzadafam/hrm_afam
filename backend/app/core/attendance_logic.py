from datetime import datetime, timedelta

def determine_shift(timestamp: datetime) -> str:
    """
    Determines if a punch belongs to a DAY or NIGHT shift.
    If the punch is between 4 PM and 4 AM, we classify it as NIGHT.
    """
    hour = timestamp.hour
    
    # Logic: If punch is between 16:00 (4PM) and 23:59 OR 00:00 and 05:00
    if hour >= 16 or hour <= 5:
        return "NIGHT"
    return "DAY"

def calculate_hours(check_in: datetime, check_out: datetime) -> float:
    """
    Calculates total hours worked. Handles cross-day logic 
    automatically because it uses full datetime objects.
    """
    if not check_out or not check_in:
        return 0.0
    
    duration = check_out - check_in
    total_seconds = duration.total_seconds()
    
    # Return hours rounded to 2 decimal places (e.g., 8.5)
    return round(total_seconds / 3600, 2)








# from datetime import datetime, time, timedelta
# from typing import List, Dict




# def determine_shift(punch_time: datetime) -> str:
#     """
#     Day Shift: 04:00 AM - 04:00 PM (04:00 - 16:00)
#     Night Shift: 04:01 PM - 03:59 AM
#     """
#     # Convert everything to minutes from start of day for easy comparison
#     minutes_since_midnight = punch_time.hour * 60 + punch_time.minute
    
#     # 04:00 is 240 minutes | 16:00 is 960 minutes
#     if 240 <= minutes_since_midnight <= 960:
#         return "Day"
#     return "Night"

# def calculate_hours(check_in: datetime, check_out: datetime) -> float:
#     """
#     Calculates decimal duration. 
#     Handles night shifts automatically if check_out is technically 'before' check_in.
#     """
#     if not check_in or not check_out:
#         return 0.0
        
#     duration = check_out - check_in
#     total_seconds = duration.total_seconds()

#     if total_seconds < 0:
#         total_seconds += 86400 
        
#     return round(total_seconds / 3600, 2)






# def aggregate_weekly_hours(logs: List[Dict]) -> Dict[str, float]:
#     """
#     Takes a list of processed IN/OUT pairs and groups them by week.
#     This is what your Payroll calculation needs for the 78/84 rule.
#     """
#     weekly_totals = {}
    
#     for log in logs:
#         # Get week label like "W10"
#         week_num = log['check_in'].isocalendar()[1]
#         week_key = f"W{week_num}"
        
#         hours = calculate_hours(log['check_in'], log['check_out'])
        
#         if week_key not in weekly_totals:
#             weekly_totals[week_key] = 0.0
        
#         weekly_totals[week_key] += hours
        
#     return weekly_totals

# def get_iso_week(punch_time: datetime) -> int:
#     """
#     Returns the ISO week number. 
#     Essential for the 78/84-hour weekly benefit calculation.
#     """
#     return punch_time.isocalendar()[1]