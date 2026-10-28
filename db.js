/**
 * db.js - SQLite Persistence Layer for MCA Live Attendance System
 * Utilizes Node.js built-in DatabaseSync engine (zero native build dependencies)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'attendance.db');
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      faculty TEXT NOT NULL,
      semester INTEGER DEFAULT 4,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      department TEXT DEFAULT 'MCA',
      semester INTEGER DEFAULT 4,
      photo_url TEXT,
      face_descriptor TEXT, -- JSON array of 128 float values
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      session_date TEXT NOT NULL, -- YYYY-MM-DD
      time_slot TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'COMPLETED'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'PRESENT', -- 'PRESENT', 'LATE', 'MANUAL'
      confidence REAL DEFAULT 1.0,
      snapshot_url TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS absentee_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      recipient_email TEXT,
      message_body TEXT,
      status TEXT DEFAULT 'SENT',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `);

  // Seed default settings if not exists
  const countSettings = db.prepare('SELECT count(*) as cnt FROM system_settings').get();
  if (countSettings.cnt === 0) {
    const insertSetting = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)');
    insertSetting.run('cooldown_seconds', '30');
    insertSetting.run('min_confidence', '0.55');
    insertSetting.run('audio_alerts', 'true');
    insertSetting.run('institution_name', 'Department of Computer Applications');
  }

  // Seed default MCA courses if empty
  const countCourses = db.prepare('SELECT count(*) as cnt FROM courses').get();
  if (countCourses.cnt === 0) {
    const insertCourse = db.prepare('INSERT INTO courses (code, name, faculty, semester) VALUES (?, ?, ?, ?)');
    insertCourse.run('MCA-401', 'Deep Learning & Neural Networks', 'Dr. Farhan Siddiqui', 4);
    insertCourse.run('MCA-402', 'Cloud Computing & DevOps', 'Prof. Neha Sharma', 4);
    insertCourse.run('MCA-403', 'Full-Stack Modern Web Architecture', 'Er. Mohd. Rehan', 4);
    insertCourse.run('MCA-404', 'Mobile Application & IoT Systems', 'Dr. Sarah Khan', 4);
  }

  // Ensure an active session exists for today
  const todayStr = new Date().toISOString().split('T')[0];
  const activeSession = db.prepare("SELECT * FROM sessions WHERE status = 'ACTIVE' LIMIT 1").get();
  if (!activeSession) {
    const firstCourse = db.prepare('SELECT id FROM courses LIMIT 1').get();
    if (firstCourse) {
      const insertSession = db.prepare('INSERT INTO sessions (course_id, session_date, time_slot, status) VALUES (?, ?, ?, ?)');
      insertSession.run(firstCourse.id, todayStr, '10:00 AM - 11:30 AM', 'ACTIVE');
    }
  }

  // Seed default sample students if no students exist
  const countStudents = db.prepare('SELECT count(*) as cnt FROM students').get();
  if (countStudents.cnt === 0) {
    const insertStudent = db.prepare(`
      INSERT INTO students (roll_no, name, email, department, semester, photo_url, face_descriptor) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertStudent.run('MCA-2026-01', 'Mohd. Shad', 'shad.mca@university.edu', 'MCA', 4, null, null);
    insertStudent.run('MCA-2026-02', 'Ayesha Siddiqui', 'ayesha.s@university.edu', 'MCA', 4, null, null);
    insertStudent.run('MCA-2026-03', 'Rahul Sharma', 'rahul.s@university.edu', 'MCA', 4, null, null);
    insertStudent.run('MCA-2026-04', 'Zainab Fatima', 'zainab.f@university.edu', 'MCA', 4, null, null);
    insertStudent.run('MCA-2026-05', 'Amit Patel', 'amit.p@university.edu', 'MCA', 4, null, null);
  }
}

// ---------------- STUDENT OPERATIONS ----------------
function getAllStudents() {
  return db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM attendance a WHERE a.student_id = s.id) as total_attended,
      (SELECT COUNT(*) FROM sessions) as total_sessions
    FROM students s 
    ORDER BY s.roll_no ASC
  `).all();
}

function getStudentsWithDescriptors() {
  return db.prepare(`
    SELECT id, roll_no, name, photo_url, face_descriptor 
    FROM students 
    WHERE face_descriptor IS NOT NULL
  `).all();
}

function getStudentById(id) {
  return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
}

function getStudentByRoll(rollNo) {
  return db.prepare('SELECT * FROM students WHERE roll_no = ?').get(rollNo);
}

function addStudent({ roll_no, name, email, department, semester, photo_url, face_descriptor }) {
  const stmt = db.prepare(`
    INSERT INTO students (roll_no, name, email, department, semester, photo_url, face_descriptor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(roll_no, name, email || '', department || 'MCA', semester || 4, photo_url || null, face_descriptor || null);
  return { id: res.lastInsertRowid, roll_no, name };
}

function updateStudentDescriptor(id, descriptorJson, photoUrl) {
  if (photoUrl) {
    const stmt = db.prepare('UPDATE students SET face_descriptor = ?, photo_url = ? WHERE id = ?');
    return stmt.run(descriptorJson, photoUrl, id);
  } else {
    const stmt = db.prepare('UPDATE students SET face_descriptor = ? WHERE id = ?');
    return stmt.run(descriptorJson, id);
  }
}

function deleteStudent(id) {
  return db.prepare('DELETE FROM students WHERE id = ?').run(id);
}

// ---------------- COURSE & SESSION OPERATIONS ----------------
function getAllCourses() {
  return db.prepare('SELECT * FROM courses ORDER BY code ASC').all();
}

function addCourse({ code, name, faculty, semester }) {
  const stmt = db.prepare('INSERT INTO courses (code, name, faculty, semester) VALUES (?, ?, ?, ?)');
  const res = stmt.run(code, name, faculty, semester || 4);
  return { id: res.lastInsertRowid, code, name };
}

function getAllSessions() {
  return db.prepare(`
    SELECT s.*, c.code as course_code, c.name as course_name, c.faculty,
      (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) as attendance_count,
      (SELECT COUNT(*) FROM students) as total_students
    FROM sessions s
    JOIN courses c ON s.course_id = c.id
    ORDER BY s.id DESC
  `).all();
}

function getActiveSession() {
  return db.prepare(`
    SELECT s.*, c.code as course_code, c.name as course_name, c.faculty
    FROM sessions s
    JOIN courses c ON s.course_id = c.id
    WHERE s.status = 'ACTIVE'
    ORDER BY s.id DESC
    LIMIT 1
  `).get();
}

function createSession({ course_id, session_date, time_slot }) {
  const stmt = db.prepare('INSERT INTO sessions (course_id, session_date, time_slot, status) VALUES (?, ?, ?, ?)');
  const res = stmt.run(course_id, session_date, time_slot, 'ACTIVE');
  return getSessionById(res.lastInsertRowid);
}

function setSessionStatus(id, status) {
  const stmt = db.prepare('UPDATE sessions SET status = ? WHERE id = ?');
  return stmt.run(status, id);
}

function getSessionById(id) {
  return db.prepare(`
    SELECT s.*, c.code as course_code, c.name as course_name, c.faculty
    FROM sessions s
    JOIN courses c ON s.course_id = c.id
    WHERE s.id = ?
  `).get(id);
}

// ---------------- ATTENDANCE OPERATIONS ----------------
function markAttendance({ session_id, student_id, confidence, snapshot_url, status }) {
  const existing = db.prepare(`
    SELECT a.*, s.name, s.roll_no 
    FROM attendance a 
    JOIN students s ON a.student_id = s.id
    WHERE a.session_id = ? AND a.student_id = ?
  `).get(session_id, student_id);

  if (existing) {
    return { already_marked: true, record: existing };
  }

  const stmt = db.prepare(`
    INSERT INTO attendance (session_id, student_id, confidence, snapshot_url, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  const res = stmt.run(session_id, student_id, confidence || 1.0, snapshot_url || null, status || 'PRESENT');

  const student = db.prepare('SELECT name, roll_no FROM students WHERE id = ?').get(student_id);

  return {
    already_marked: false,
    record: {
      id: res.lastInsertRowid,
      session_id,
      student_id,
      marked_at: new Date().toISOString(),
      status: status || 'PRESENT',
      confidence: confidence || 1.0,
      name: student ? student.name : 'Unknown',
      roll_no: student ? student.roll_no : 'Unknown'
    }
  };
}

function toggleManualAttendance({ session_id, student_id, status }) {
  const existing = db.prepare('SELECT id, status FROM attendance WHERE session_id = ? AND student_id = ?').get(session_id, student_id);
  if (existing) {
    if (status === 'ABSENT') {
      db.prepare('DELETE FROM attendance WHERE id = ?').run(existing.id);
      return { status: 'ABSENT', action: 'deleted' };
    } else {
      db.prepare('UPDATE attendance SET status = ? WHERE id = ?').run(status, existing.id);
      return { status, action: 'updated' };
    }
  } else {
    if (status !== 'ABSENT') {
      const stmt = db.prepare('INSERT INTO attendance (session_id, student_id, status, confidence) VALUES (?, ?, ?, 1.0)');
      stmt.run(session_id, student_id, status || 'MANUAL');
      return { status: status || 'MANUAL', action: 'inserted' };
    }
    return { status: 'ABSENT', action: 'none' };
  }
}

function getSessionAttendance(sessionId) {
  return db.prepare(`
    SELECT s.id as student_id, s.roll_no, s.name, s.department, s.semester, s.photo_url,
      a.id as attendance_id, a.marked_at, a.status, a.confidence, a.snapshot_url
    FROM students s
    LEFT JOIN attendance a ON s.id = a.student_id AND a.session_id = ?
    ORDER BY s.roll_no ASC
  `).all(sessionId);
}

function getLiveLogs(limit = 20) {
  return db.prepare(`
    SELECT a.id, a.marked_at, a.status, a.confidence, a.snapshot_url,
      s.roll_no, s.name, s.department,
      c.code as course_code, c.name as course_name
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    JOIN sessions sess ON a.session_id = sess.id
    JOIN courses c ON sess.course_id = c.id
    ORDER BY a.marked_at DESC
    LIMIT ?
  `).all(limit);
}

function getDashboardStats(sessionId) {
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;

  let presentCount = 0;
  let activeSession = null;

  if (sessionId) {
    activeSession = getSessionById(sessionId);
    const countPresent = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE session_id = ?').get(sessionId);
    presentCount = countPresent ? countPresent.count : 0;
  } else {
    activeSession = getActiveSession();
    if (activeSession) {
      const countPresent = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE session_id = ?').get(activeSession.id);
      presentCount = countPresent ? countPresent.count : 0;
    }
  }

  const enrolledWithFaces = db.prepare('SELECT COUNT(*) as count FROM students WHERE face_descriptor IS NOT NULL').get().count;
  const absentCount = Math.max(0, totalStudents - presentCount);
  const attendanceRate = totalStudents > 0 ? ((presentCount / totalStudents) * 100).toFixed(1) : '0.0';

  return {
    totalStudents,
    enrolledWithFaces,
    totalSessions,
    activeSession,
    presentCount,
    absentCount,
    attendanceRate
  };
}

// ---------------- ABSENTEE ALERTS & ANALYTICS ----------------
function sendAbsenteeAlerts(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return { count: 0, alerts: [] };

  const absentStudents = db.prepare(`
    SELECT s.id, s.name, s.roll_no, s.email 
    FROM students s
    WHERE s.id NOT IN (
      SELECT student_id FROM attendance WHERE session_id = ?
    )
  `).all(sessionId);

  const insertAlert = db.prepare(`
    INSERT INTO absentee_alerts (session_id, student_id, recipient_email, message_body, status)
    VALUES (?, ?, ?, ?, 'SENT')
  `);

  const alerts = [];
  for (const s of absentStudents) {
    const email = s.email || `${s.roll_no.toLowerCase()}@university.edu`;
    const message = `Notice: Student ${s.name} (${s.roll_no}) was marked ABSENT for lecture ${session.course_code}: ${session.course_name} on ${session.session_date} (${session.time_slot}).`;
    insertAlert.run(sessionId, s.id, email, message);
    alerts.push({ student_id: s.id, name: s.name, roll_no: s.roll_no, email, message });
  }

  return { count: alerts.length, alerts, course: session.course_code, date: session.session_date };
}

function getAbsenteeAlerts(sessionId) {
  return db.prepare(`
    SELECT a.*, s.name, s.roll_no 
    FROM absentee_alerts a
    JOIN students s ON a.student_id = s.id
    WHERE a.session_id = ?
    ORDER BY a.sent_at DESC
  `).all(sessionId);
}

function getAttendanceAnalytics() {
  const courses = db.prepare(`
    SELECT c.id, c.code, c.name,
      (SELECT COUNT(*) FROM sessions s WHERE s.course_id = c.id) as session_count,
      (SELECT COUNT(*) FROM attendance a JOIN sessions s ON a.session_id = s.id WHERE s.course_id = c.id) as attendance_count,
      (SELECT COUNT(*) FROM students) as total_students
    FROM courses c
  `).all();

  const formattedCourses = courses.map(c => {
    const totalPossible = Math.max(1, c.session_count * c.total_students);
    const avgRate = ((c.attendance_count / totalPossible) * 100).toFixed(1);
    return {
      code: c.code,
      name: c.name,
      sessions: c.session_count,
      attended: c.attendance_count,
      rate: parseFloat(avgRate)
    };
  });

  const students = getAllStudents();
  let safeCount = 0;
  let shortageCount = 0;
  for (const s of students) {
    const pct = s.total_sessions > 0 ? (s.total_attended / s.total_sessions) * 100 : 0;
    if (pct >= 75) safeCount++;
    else shortageCount++;
  }

  return {
    courses: formattedCourses,
    safeCount,
    shortageCount,
    totalStudents: students.length
  };
}

module.exports = {
  db,
  initDatabase,
  getAllStudents,
  getStudentsWithDescriptors,
  getStudentById,
  getStudentByRoll,
  addStudent,
  updateStudentDescriptor,
  deleteStudent,
  getAllCourses,
  addCourse,
  getAllSessions,
  getActiveSession,
  getSessionById,
  createSession,
  setSessionStatus,
  markAttendance,
  toggleManualAttendance,
  getSessionAttendance,
  getLiveLogs,
  getDashboardStats,
  sendAbsenteeAlerts,
  getAbsenteeAlerts,
  getAttendanceAnalytics
};
