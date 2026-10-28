"""
verify_biometrics.py - Python Companion Module for MCA Live Attendance System
Allows academic examiners to inspect the SQLite database, query biometric logs,
and verify student attendance records directly via Python CLI.
"""

import sqlite3
import json
import os
import sys
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'attendance.db')

def get_db_connection():
    if not os.path.exists(DB_PATH):
        print(f"[!] Database file not found at: {DB_PATH}")
        sys.exit(1)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def print_summary():
    conn = get_db_connection()
    cursor = conn.cursor()

    print("\n" + "=" * 65)
    print(" VISIONATTEND: MCA LIVE ATTENDANCE SYSTEM - PYTHON MODULE")
    print("=" * 65)

    # 1. Total Enrolled Students
    cursor.execute("SELECT count(*) as cnt FROM students")
    total_students = cursor.fetchone()['cnt']

    cursor.execute("SELECT count(*) as cnt FROM students WHERE face_descriptor IS NOT NULL")
    biometric_enrolled = cursor.fetchone()['cnt']

    # 2. Courses
    cursor.execute("SELECT count(*) as cnt FROM courses")
    total_courses = cursor.fetchone()['cnt']

    # 3. Attendance Logs
    cursor.execute("SELECT count(*) as cnt FROM attendance")
    total_attendance = cursor.fetchone()['cnt']

    print(f"[*] Total Enrolled Students:        {total_students}")
    print(f"[*] Students with 128-D Biometrics: {biometric_enrolled}")
    print(f"[*] Configured Academic Courses:    {total_courses}")
    print(f"[*] Total Attendance Logs Recorded: {total_attendance}")
    print("=" * 65)

    # Display Students Table
    print("\n[+] ENROLLED STUDENTS DIRECTORY:")
    print("-" * 65)
    print(f"{'ROLL NO':<15} {'NAME':<20} {'DEPARTMENT':<10} {'BIOMETRICS':<12}")
    print("-" * 65)
    cursor.execute("SELECT roll_no, name, department, face_descriptor FROM students ORDER BY roll_no ASC")
    for row in cursor.fetchall():
        bio_status = "Active 128D" if row['face_descriptor'] else "Pending"
        print(f"{row['roll_no']:<15} {row['name']:<20} {row['department']:<10} {bio_status:<12}")

    # Display Latest Attendance Records
    print("\n[+] RECENT ATTENDANCE LOGS:")
    print("-" * 65)
    print(f"{'TIME':<20} {'ROLL NO':<14} {'NAME':<18} {'STATUS':<10}")
    print("-" * 65)
    cursor.execute("""
        SELECT a.marked_at, s.roll_no, s.name, a.status, a.confidence
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        ORDER BY a.marked_at DESC
        LIMIT 10
    """)
    records = cursor.fetchall()
    if not records:
        print("  No attendance records found yet.")
    else:
        for r in records:
            time_str = r['marked_at'][:19] if r['marked_at'] else 'N/A'
            print(f"{time_str:<20} {r['roll_no']:<14} {r['name']:<18} {r['status']:<10}")

    print("=" * 65 + "\n")
    conn.close()

if __name__ == '__main__':
    print_summary()
