const Database = require('better-sqlite3');
const db = new Database('license.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS licenses (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, hwid TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS payloads (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, filename TEXT NOT NULL, uploaded_at INTEGER NOT NULL, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL, license_id INTEGER NOT NULL, hwid TEXT NOT NULL, ip TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS key_payloads (license_id INTEGER NOT NULL, payload_id INTEGER NOT NULL, PRIMARY KEY (license_id, payload_id));
`);
module.exports = db;