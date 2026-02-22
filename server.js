import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { hash, compare } from 'bcrypt';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

//db.query(`
//  ALTER TABLE lateness_records 
//  MODIFY id INT AUTO_INCREMENT,
//  MODIFY arrival_time DATETIME DEFAULT CURRENT_TIMESTAMP;
//`)
//.then(() => {
//  console.log("SUCCESS: Table structure updated!");
//})
//.catch((err) => {
//  console.error("Fix failed or already applied:", err.message);
//});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// --- API ROUTES ---

app.post('/api/register', async (req, res) => {
  try {
    const { student_id, email, password, name, ship, level, grade, class_group } = req.body;
    const hashedPassword = await hash(password, 10);
    const sql = `INSERT INTO students (student_id, email, password, name, ship, level, grade, class) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await db.execute(sql, [student_id, email, hashedPassword, name, ship, level, grade, class_group]);
    res.json({ message: "Student account created!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [results] = await db.execute(`SELECT * FROM students WHERE email = ? LIMIT 1`, [email]);
    if (results.length === 0) return res.status(401).json({ error: "User not found" });

    const user = results[0];
    const match = await compare(password, user.password);
    if (match) {
      delete user.password; 
      user.class_group = user.class;
      res.json({ message: "Login successful", user });
    } else {
      res.status(401).json({ error: "Wrong password" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to save student face data
app.post('/api/enroll-face', async (req, res) => {
  try {
    const { student_id, face_descriptor } = req.body;
    const sql = `UPDATE students SET face_descriptor = ? WHERE student_id = ?`;
    await db.execute(sql, [JSON.stringify(face_descriptor), student_id]);
    res.json({ message: "Face enrolled!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scan', async (req, res) => {
  try {
    const { student_id, reason, minutes_late } = req.body;
    const sql = `INSERT INTO lateness_records (student_id, reason, minutes_late) VALUES (?, ?, ?)`;
    await db.execute(sql, [student_id, reason, minutes_late]);
    res.json({ message: "Attendance recorded!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:student_id', async (req, res) => {
  try {
    const [results] = await db.execute(
      `SELECT * FROM lateness_records WHERE student_id = ? ORDER BY arrival_time DESC`,
      [req.params.student_id]
    );
    
    res.json(results);
  } catch (err) {
    console.error("Database Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/records', async (req, res) => {
  try {
    const sql = `
      SELECT s.student_id, s.name, s.level, s.grade, s.class as class_group, s.ship, 
             l.arrival_time as date, l.minutes_late as total_lateness, l.reason,
             IF(s.face_descriptor IS NOT NULL, 'Yes', 'No') as face_registered
      FROM lateness_records l
      JOIN students s ON l.student_id = s.student_id
      ORDER BY l.arrival_time DESC`;
    const [results] = await db.execute(sql);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/models', express.static(join(__dirname, 'dist/models'), {
    setHeaders: (res, path) => {
        // Forces the server to treat shards as binary data (so it can be downloaded and read by face-api.js) instead of trying to parse them as text)
        if (path.includes('-shard')) {
            res.set('Content-Type', 'application/octet-stream');
        }
    }
}));

app.use(express.static(join(__dirname, 'dist')));

app.use((req, res) => {
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: "API route not found" });
  }
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is awake!`);
  //console.log(`Local Access: http://localhost:${PORT}`);
  //console.log(`Network Access: http://192.168.134.35:${PORT}`);
});