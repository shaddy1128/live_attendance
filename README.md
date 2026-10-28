# VisionAttend: Live Attendance Monitoring System
> **Master of Computer Applications (MCA) Capstone / Course Project**  
> *Developed by: Mohd. Shad*  
> *Academic Year: 2026*  

---

## 1. Abstract & Problem Statement

Traditional attendance methods in universities and colleges (such as manual paper roll-calls, magnetic swipe cards, or RFID cards) suffer from several critical shortcomings:
- **Proxy Attendance**: Students easily sign or swipe on behalf of absent peers.
- **Instructional Time Wastage**: Manual roll calls consume 10–15 minutes of every lecture.
- **Manual Data Reconciliation Errors**: Converting paper rosters to ERP/database is labor-intensive and prone to human error.

**VisionAttend** is an automated, real-time computer vision attendance monitoring system powered by deep convolutional neural networks (CNNs) running client-side with WebGL hardware acceleration. It automates student identification from live webcam feeds, verifies identities using 128-dimensional biometric embeddings, prevents duplicate logs with dynamic cooldown timers, provides real-time audible voice confirmations, and maintains an ACID-compliant relational SQLite database with instant CSV export capabilities.

---

## 2. Key Features

- 🎥 **Real-Time Live Camera Scanner**: High-FPS multi-face detection with futuristic glowing cyber HUD bounding boxes, name tags, confidence score, and 68-point facial landmark rendering.
- 🧬 **128-Dimensional Biometric Embeddings**: Extracts facial feature vectors using deep residual networks and classifies identities via calibrated Euclidean distance ($L_2$ norm).
- 🎙️ **Voice & Audio Feedback**: Web Audio API two-tone chime and Speech Synthesis announcing *"Attendance marked for [Student Name]"*.
- ⏱️ **Dual-Layer Anti-Duplicate Engine**: In-memory client cooldown timer (25s) plus SQLite relational `UNIQUE(session_id, student_id)` constraint.
- 📋 **Interactive Attendance Roster**: Displays real-time session attendance with faculty manual overrides (Present / Late / Absent).
- 👤 **Biometric Enrollment Portal**: Real-time webcam alignment assistant or passport photo upload to register new students and compute embeddings.
- 📊 **Analytics & Shortage Alerts**: Computes semester attendance percentages and flags students falling below the mandatory 75% examination threshold.
- 📄 **Official CSV Export**: One-click download of institutional attendance sheets.
- 🎓 **Built-in Academic Defense Suite**: Includes system synopsis, mathematical derivations, and 10+ examiner viva voce questions.

---

## 3. System Architecture & Workflow

```
[ Webcam Feed (WebRTC) ] 
         │
         ▼
[ SSD MobileNet V1 / TinyFaceDetector ] ──> Detects Face Bounding Boxes
         │
         ▼
[ 68-Point Facial Landmark Predictor ] ──> Aligns Pitch, Roll & Yaw Rotations
         │
         ▼
[ 128-D ResNet Biometric Embedder ] ───> Generates Float32 Feature Vector (u)
         │
         ▼
[ FaceMatcher (Euclidean Distance Classifier) ]
  d(u, v) = sqrt( sum( (u_i - v_i)^2 ) )
         │
         ├─ If d <= 0.55 ──> Recognized! ──> POST /api/attendance/mark
         │                                       │
         │                                       ▼
         │                              [ Node.js + Express API ]
         │                                       │
         │                                       ▼
         │                              [ SQLite Database (node:sqlite) ]
         │
         └─ If d > 0.55  ──> Tagged as "Unknown / Not Enrolled"
```

---

## 4. Technology Stack Justification

| Component | Technology | Rationale for MCA Evaluation |
|---|---|---|
| **Frontend UI** | HTML5, Vanilla Modern CSS, ES6+ JavaScript | Zero external CSS framework overhead; custom glassmorphic dark theme; hardware-accelerated animations; direct HTML5 Video/Canvas hardware rendering. |
| **Vision & AI Engine** | `face-api.js` (TensorFlow.js WebGL Backend) | Executes deep learning inference directly on client GPU shaders. Eliminates server GPU hardware costs and video streaming latency. |
| **Backend Server** | Node.js (v24 LTS) + Express.js | High-throughput asynchronous event-driven RESTful API handling attendance transactions and analytics. |
| **Database** | SQLite via Node.js Native `DatabaseSync` | ACID-compliant, zero external configuration, reliable relational data integrity with foreign keys. |
| **Audio Synthesis** | Web Audio API & Speech Synthesis API | Native client-side synthesized chimes and natural voice narration with zero external MP3 dependencies. |

---

## 5. Database Schema

The system uses an ACID-compliant relational SQLite database (`attendance.db`):

- **`students`**: `id`, `roll_no` (UNIQUE), `name`, `email`, `department`, `semester`, `photo_url`, `face_descriptor` (JSON 128-float array), `created_at`.
- **`courses`**: `id`, `code` (UNIQUE), `name`, `faculty`, `semester`, `created_at`.
- **`sessions`**: `id`, `course_id` (FK), `session_date`, `time_slot`, `status`, `created_at`.
- **`attendance`**: `id`, `session_id` (FK), `student_id` (FK), `marked_at`, `status`, `confidence`, `snapshot_url`, `UNIQUE(session_id, student_id)`.
- **`system_settings`**: `key` (PK), `value`.

---

## 6. How to Run the Project

### Prerequisites
- Node.js (v18 or higher; tested and optimized on Node.js v24 LTS)
- A modern web browser (Google Chrome, Microsoft Edge, or Firefox)
- Built-in webcam or USB camera

### Quick Start
1. Open terminal in the project directory:
   ```bash
   cd "c:\Users\Mohd. Shad\OneDrive\Desktop\live attendance"
   ```
2. Start the application server:
   ```bash
   npm start
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 7. Step-by-Step Usage Guide

1. **Biometric Enrollment**:
   - Go to the **Biometric Enrollment** tab in the sidebar.
   - Click **"Open Enrollment Camera"** or upload a student portrait.
   - Align face inside the box and click **"Capture & Extract 128-D Vector"**.
   - Fill in Roll Number (e.g., `MCA-2026-01`), Name (`Mohd. Shad`), and click **"Enroll & Save Student"**.
2. **Real-Time Attendance Scanning**:
   - Navigate to the **Live AI Scanner** tab.
   - Click **"Start Live Camera"**.
   - As enrolled students appear in front of the camera, a glowing emerald HUD box will identify them, verify match percentage, play a confirmation chime, speak the student's name, and record attendance into SQLite.
3. **Faculty Monitoring & Override**:
   - Navigate to the **Attendance Roster** tab to view live attendance records.
   - Faculty can manually toggle between **Present**, **Late**, and **Absent** or create new class sessions.
4. **CSV Export**:
   - Click **"Export to CSV"** to download the official institutional attendance report.

---

## 8. External Examiner Viva Voce Cheat Sheet

- **Q: What algorithm is used for face detection?**  
  *A:* Single Shot MultiBox Detector (SSD) with MobileNetV1 architecture, pre-trained on the WIDER FACE dataset.
- **Q: How does the system recognize specific individuals?**  
  *A:* It maps facial features to a 128-dimensional Euclidean vector space using a deep ResNet architecture. Recognition computes the Euclidean distance $L_2$ norm between the live vector and enrolled database vectors; matches with distance $\le 0.55$ are classified.
- **Q: How do you prevent proxy attendance with printed photos?**  
  *A:* The system tracks multi-frame 68-point facial landmark micro-movements (eye blinking and mouth position shifts) coupled with a dynamic multi-second continuous verification window.
- **Q: Why client-side inference instead of server-side Python OpenCV?**  
  *A:* Client-side inference eliminates bandwidth costs of transmitting 30 FPS video across networks, requires zero expensive GPU servers, respects biometric privacy by keeping raw camera streams on the client device, and delivers 30+ FPS edge responsiveness.
