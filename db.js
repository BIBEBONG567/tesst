const Database = require('better-sqlite3');
const path = require('path');

// Tạo file database.sqlite trong cùng thư mục
const db = new Database(path.join(__dirname, 'database.sqlite'));

// Khởi tạo các bảng cần thiết
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    hwid TEXT,
    created_at INTEGER,
    expires_at INTEGER,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS payloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    filename TEXT,
    uploaded_at INTEGER,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS key_payloads (
    license_id INTEGER,
    payload_id INTEGER,
    PRIMARY KEY (license_id, payload_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    license_id INTEGER,
    hwid TEXT,
    ip TEXT,
    created_at INTEGER
  );
`);

module.exports = db;
