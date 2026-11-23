const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'CHANGE_THIS_SECRET_IN_PROD_9f3a2c';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123'; 

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(ADMIN_USER);
if (!existing) db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(ADMIN_USER, sha256(ADMIN_PASS));

function requireAdmin(req, res, next) {
  try {
    const payload = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    if (payload.role !== 'admin') throw new Error();
    next();
  } catch (e) { res.status(401).json({ error: 'unauthorized' }); }
}

// --- ADMIN AUTH ---
app.post('/api/admin/login', (req, res) => {
  const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.body.username);
  if (!row || row.password_hash !== sha256(req.body.password)) return res.status(401).json({ error: 'bad credentials' });
  res.json({ token: jwt.sign({ role: 'admin', uid: row.id }, JWT_SECRET, { expiresIn: '12h' }) });
});

// --- KEYS MANAGEMENT ---
app.post('/api/admin/keys', requireAdmin, (req, res) => {
  const { days = 30, count = 1 } = req.body;
  const created = [];
  const stmt = db.prepare('INSERT INTO licenses (key, created_at, expires_at) VALUES (?, ?, ?)');
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const key = crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{4}/g).join('-');
    stmt.run(key, now, now + days * 86400000);
    created.push(key);
  }
  res.json({ keys: created });
});

app.get('/api/admin/keys', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM licenses ORDER BY id DESC').all());
});

app.delete('/api/admin/keys/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE licenses SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/keys/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM licenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/keys/:id/reset-hwid', requireAdmin, (req, res) => {
  db.prepare('UPDATE licenses SET hwid = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/keys/purge', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM licenses WHERE active = 0').run();
  res.json({ ok: true });
});

// --- QUẢN LÝ GÁN FILE CHO KEY ---
app.post('/api/admin/keys/:id/assign', requireAdmin, (req, res) => {
  const { payload_id } = req.body;
  db.prepare('INSERT OR IGNORE INTO key_payloads (license_id, payload_id) VALUES (?, ?)').run(req.params.id, payload_id);
  res.json({ ok: true });
});

app.delete('/api/admin/keys/:id/clear', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM key_payloads WHERE license_id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/keys/:id/payloads', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT payload_id FROM key_payloads WHERE license_id = ?').all(req.params.id);
  res.json(rows.map(r => r.payload_id));
});

// --- PAYLOADS MANAGEMENT ---
app.post('/api/admin/payload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const name = req.body.name || req.file.originalname;
  const finalName = `${Date.now()}_${req.file.originalname}`;
  fs.renameSync(req.file.path, path.join(uploadDir, finalName));
  db.prepare('INSERT INTO payloads (name, filename, uploaded_at) VALUES (?, ?, ?)').run(name, finalName, Date.now());
  res.json({ ok: true, name });
});

app.get('/api/admin/payloads', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM payloads WHERE active = 1 ORDER BY id DESC').all());
});

app.delete('/api/admin/payload/:id', requireAdmin, (req, res) => {
  const payload = db.prepare('SELECT * FROM payloads WHERE id = ?').get(req.params.id);
  if (payload) {
    const filePath = path.join(uploadDir, payload.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM payloads WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM key_payloads WHERE payload_id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// --- CLIENT ENDPOINTS ---
app.post('/api/activate', (req, res) => {
  const { key, hwid } = req.body;
  if (!key || !hwid) return res.status(400).json({ error: 'missing fields' });
  const row = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
  if (!row) return res.status(404).json({ error: 'key not found' });
  if (!row.active) return res.status(403).json({ error: 'key revoked' });
  if (row.expires_at < Date.now()) return res.status(403).json({ error: 'key expired' });
  if (row.hwid && row.hwid !== hwid) return res.status(403).json({ error: 'hwid mismatch' });
  if (!row.hwid) db.prepare('UPDATE licenses SET hwid = ? WHERE id = ?').run(hwid, row.id);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, license_id, hwid, ip, created_at) VALUES (?, ?, ?, ?, ?)').run(token, row.id, hwid, req.ip, Date.now());
  res.json({ ok: true, token, expires_at: row.expires_at, license_id: row.id });
});

app.get('/api/payloads', (req, res) => {
  const token = req.headers['x-session-token'];
  const session = token ? db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) : null;
  if (!session) return res.status(401).json({ error: 'bad session' });
  
  const rows = db.prepare(`
    SELECT p.id, p.name FROM payloads p
    JOIN key_payloads kp ON p.id = kp.payload_id
    WHERE kp.license_id = ? AND p.active = 1 ORDER BY p.id DESC
  `).all(session.license_id);
  
  res.json(rows);
});

app.get('/api/payload/:id', (req, res) => {
  const token = req.headers['x-session-token'];
  const session = token ? db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) : null;
  if (!session) return res.status(401).json({ error: 'bad session' });
  
  const allowed = db.prepare('SELECT * FROM key_payloads WHERE license_id = ? AND payload_id = ?').get(session.license_id, req.params.id);
  if (!allowed) return res.status(403).json({ error: 'unauthorized payload' });

  const payload = db.prepare('SELECT * FROM payloads WHERE id = ? AND active = 1').get(req.params.id);
  if (!payload) return res.status(404).json({ error: 'payload not found' });
  const filePath = path.join(uploadDir, payload.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file missing' });
  res.json({ name: payload.name, filename: payload.filename, data: fs.readFileSync(filePath).toString('base64') });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`[license-server] http://localhost:${PORT}`));
