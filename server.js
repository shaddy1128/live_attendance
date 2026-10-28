/**
 * server.js - Express REST API & Web Server
 * Live Attendance Monitoring System for MCA Project
 */

const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');

const {
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
} = require('./db.js');

// Initialize database tables & defaults
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static file hosting
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Configure Multer for student snapshot/upload storage
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, 'face-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: uploadStorage });

// Helper to save base64 data URLs to file
function saveBase64Image(dataUrl, prefix = 'snap') {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
  try {
    const matches = dataUrl.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    const ext = matches[1].replace('jpeg', 'jpg');
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e4)}.${ext}`;
    const uploadDir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, filename), buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving base64 image:', err);
    return null;
  }
}

// ---------------- REST API ROUTES ----------------

// Dashboard Stats
app.get('/api/stats', (req, res) => {
  try {
    const sessionId = req.query.session_id ? parseInt(req.query.session_id) : null;
    const stats = getDashboardStats(sessionId);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Students
app.get('/api/students', (req, res) => {
  try {
    const students = getAllStudents();
    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Enrolled biometrics (used by FaceMatcher)
app.get('/api/students/descriptors', (req, res) => {
  try {
    const enrolled = getStudentsWithDescriptors();
    const formatted = enrolled.map(s => ({
      id: s.id,
      roll_no: s.roll_no,
      name: s.name,
      photo_url: s.photo_url,
      descriptor: s.face_descriptor ? JSON.parse(s.face_descriptor) : null
    }));
    res.json({ success: true, students: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/students', (req, res) => {
  try {
    const { roll_no, name, email, department, semester, photo_base64, face_descriptor } = req.body;
    if (!roll_no || !name) {
      return res.status(400).json({ success: false, error: 'Roll number and Name are required' });
    }

    // Check duplicate roll number
    const existing = getStudentByRoll(roll_no.trim());
    if (existing) {
      return res.status(400).json({ success: false, error: `Roll number ${roll_no} already exists` });
    }

    let photo_url = null;
    if (photo_base64) {
      photo_url = saveBase64Image(photo_base64, 'student');
    }

    let descriptorString = null;
    if (face_descriptor) {
      descriptorString = typeof face_descriptor === 'string' ? face_descriptor : JSON.stringify(face_descriptor);
    }

    const created = addStudent({
      roll_no: roll_no.trim(),
      name: name.trim(),
      email: email ? email.trim() : '',
      department: department || 'MCA',
      semester: parseInt(semester) || 4,
      photo_url,
      face_descriptor: descriptorString
    });

    res.json({ success: true, student: created, message: 'Student registered successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/students/:id/descriptor', (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    const { face_descriptor, photo_base64 } = req.body;

    if (!face_descriptor) {
      return res.status(400).json({ success: false, error: 'Face descriptor is required' });
    }

    let photo_url = null;
    if (photo_base64) {
      photo_url = saveBase64Image(photo_base64, 'student');
    }

    const descriptorString = typeof face_descriptor === 'string' ? face_descriptor : JSON.stringify(face_descriptor);
    updateStudentDescriptor(studentId, descriptorString, photo_url);

    res.json({ success: true, message: 'Biometric descriptor updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/students/:id', (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    deleteStudent(studentId);
    res.json({ success: true, message: 'Student record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Courses
app.get('/api/courses', (req, res) => {
  try {
    const courses = getAllCourses();
    res.json({ success: true, courses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/courses', (req, res) => {
  try {
    const { code, name, faculty, semester } = req.body;
    if (!code || !name || !faculty) {
      return res.status(400).json({ success: false, error: 'Course code, name, and faculty required' });
    }
    const created = addCourse({ code, name, faculty, semester: parseInt(semester) || 4 });
    res.json({ success: true, course: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sessions
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = getAllSessions();
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sessions/active', (req, res) => {
  try {
    const active = getActiveSession();
    res.json({ success: true, session: active });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sessions', (req, res) => {
  try {
    const { course_id, session_date, time_slot } = req.body;
    if (!course_id) {
      return res.status(400).json({ success: false, error: 'Course ID is required' });
    }
    const dateStr = session_date || new Date().toISOString().split('T')[0];
    const slotStr = time_slot || '10:00 AM - 11:30 AM';
    const created = createSession({ course_id: parseInt(course_id), session_date: dateStr, time_slot: slotStr });
    res.json({ success: true, session: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/sessions/:id/status', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { status } = req.body;
    setSessionStatus(sessionId, status || 'COMPLETED');
    res.json({ success: true, message: `Session status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Attendance Roster
app.get('/api/attendance', (req, res) => {
  try {
    const sessionId = req.query.session_id ? parseInt(req.query.session_id) : (getActiveSession()?.id || null);
    if (!sessionId) {
      return res.json({ success: true, attendance: [], session: null });
    }
    const session = getSessionById(sessionId);
    const attendance = getSessionAttendance(sessionId);
    res.json({ success: true, session, attendance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Real-Time Attendance Marker (From Live Scanner)
app.post('/api/attendance/mark', (req, res) => {
  try {
    let { session_id, student_id, confidence, snapshot_base64, status } = req.body;

    if (!session_id) {
      const active = getActiveSession();
      if (!active) {
        return res.status(400).json({ success: false, error: 'No active session found to mark attendance' });
      }
      session_id = active.id;
    }

    if (!student_id) {
      return res.status(400).json({ success: false, error: 'student_id is required' });
    }

    let snapshot_url = null;
    if (snapshot_base64) {
      snapshot_url = saveBase64Image(snapshot_base64, 'attend');
    }

    const result = markAttendance({
      session_id: parseInt(session_id),
      student_id: parseInt(student_id),
      confidence: confidence ? parseFloat(confidence) : 1.0,
      snapshot_url,
      status: status || 'PRESENT'
    });

    res.json({
      success: true,
      already_marked: result.already_marked,
      record: result.record,
      message: result.already_marked ? 'Already marked for this session' : 'Attendance marked successfully'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual Faculty Override (Toggle Present / Late / Absent)
app.post('/api/attendance/toggle', (req, res) => {
  try {
    const { session_id, student_id, status } = req.body;
    if (!session_id || !student_id) {
      return res.status(400).json({ success: false, error: 'session_id and student_id required' });
    }
    const result = toggleManualAttendance({
      session_id: parseInt(session_id),
      student_id: parseInt(student_id),
      status: status || 'PRESENT'
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live Event Stream Logs
app.get('/api/attendance/logs', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const logs = getLiveLogs(limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Attendance to CSV
app.get('/api/attendance/export', (req, res) => {
  try {
    const sessionId = req.query.session_id ? parseInt(req.query.session_id) : (getActiveSession()?.id || null);
    if (!sessionId) {
      return res.status(400).send('Session ID required');
    }

    const session = getSessionById(sessionId);
    const roster = getSessionAttendance(sessionId);

    let csv = `MCA Live Attendance Report\n`;
    csv += `Course Code,${session ? session.course_code : 'N/A'}\n`;
    csv += `Course Name,${session ? session.course_name : 'N/A'}\n`;
    csv += `Faculty,${session ? session.faculty : 'N/A'}\n`;
    csv += `Date,${session ? session.session_date : 'N/A'}\n`;
    csv += `Time Slot,${session ? session.time_slot : 'N/A'}\n\n`;

    csv += `Roll No,Student Name,Department,Semester,Status,Time Marked,Confidence Score\n`;

    for (const row of roster) {
      const status = row.status || 'ABSENT';
      const timeMarked = row.marked_at ? new Date(row.marked_at).toLocaleTimeString() : '-';
      const confidence = row.confidence ? (row.confidence * 100).toFixed(1) + '%' : '-';
      csv += `"${row.roll_no}","${row.name}","${row.department}","${row.semester}","${status}","${timeMarked}","${confidence}"\n`;
    }

    const filename = `attendance_${session ? session.course_code : 'session'}_${session ? session.session_date : 'date'}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).send('Export failed: ' + err.message);
  }
});

// Trigger Absentee Notifications Simulation
app.post('/api/attendance/alerts/send', (req, res) => {
  try {
    const sessionId = req.body.session_id ? parseInt(req.body.session_id) : (getActiveSession()?.id || null);
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID required' });
    }
    const result = sendAbsenteeAlerts(sessionId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Sent Absentee Alerts
app.get('/api/attendance/alerts', (req, res) => {
  try {
    const sessionId = req.query.session_id ? parseInt(req.query.session_id) : (getActiveSession()?.id || null);
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID required' });
    }
    const alerts = getAbsenteeAlerts(sessionId);
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Advanced Analytics Summary
app.get('/api/analytics/summary', (req, res) => {
  try {
    const analytics = getAttendanceAnalytics();
    res.json({ success: true, analytics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SPA Fallback middleware for Express 5
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` MCA Live Attendance Monitoring System is RUNNING!`);
  console.log(` Web Server URL: http://localhost:${PORT}`);
  console.log(` Database: SQLite (Node.js native DatabaseSync)`);
  console.log(` Biometrics: Face-API.js Deep Learning Pipeline`);
  console.log(`====================================================`);
});
