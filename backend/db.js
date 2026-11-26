const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.ULTRAGRAM_DB || path.join(__dirname, '..', 'database', 'ultragram.db');

let SQL = null;
let db = null;
let saveTimer = null;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const data = db.export();
      const buf = Buffer.from(data);
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, buf);
    } catch (e) { console.error('DB save error', e); }
  }, 200);
}

function run(sql, params = []) {
  db.run(sql, params);
  scheduleSave();
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const r = all(sql, params);
  return r[0] || null;
}

function exec(sql) { db.exec(sql); scheduleSave(); }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  phone TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  status TEXT DEFAULT 'active',
  is_online INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  theme TEXT DEFAULT 'dark',
  ghost_mode INTEGER DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  device TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY(user_id, role),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS verification (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'Unverified',
  granted_by TEXT,
  granted_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  description TEXT,
  owner_id TEXT,
  created_at INTEGER NOT NULL,
  is_public INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(chat_id, user_id),
  FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'text',
  reply_to TEXT,
  pinned INTEGER DEFAULT 0,
  edited INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS message_revisions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  content TEXT,
  revised_at INTEGER NOT NULL,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(message_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS groups (chat_id TEXT PRIMARY KEY, FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS channels (chat_id TEXT PRIMARY KEY, views INTEGER DEFAULT 0, FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  chat_id TEXT,
  caller_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'ringing',
  started_at INTEGER,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  from_user TEXT,
  to_user TEXT,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  idempotency_key TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  rarity TEXT NOT NULL,
  category TEXT,
  image TEXT,
  animation TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gift_inventory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  gift_id TEXT NOT NULL,
  pinned INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  acquired_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(gift_id) REFERENCES gifts(id)
);
CREATE TABLE IF NOT EXISTS gift_transfers (
  id TEXT PRIMARY KEY,
  gift_inventory_id TEXT NOT NULL,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  body TEXT,
  read INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS premium_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  active INTEGER DEFAULT 0,
  started_at INTEGER,
  expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS phone_verifications (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pv_phone ON phone_verifications(phone, purpose);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(from_user, to_user);
CREATE INDEX IF NOT EXISTS idx_gift_inventory_user ON gift_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
`;

async function init() {
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.exec(SCHEMA);
  db.exec(INDEXES);
  // safe migrations
  try { db.exec('ALTER TABLE user_profiles ADD COLUMN public_key TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE messages ADD COLUMN encrypted INTEGER DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE messages ADD COLUMN iv TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN password_reset_token TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN password_reset_expires INTEGER'); } catch (e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT'); } catch (e) {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL'); } catch (e) {}
  scheduleSave();
  return db;
}

function close() { if (db) { const data = db.export(); fs.writeFileSync(DB_PATH, Buffer.from(data)); } }

module.exports = { init, run, all, get, exec, scheduleSave, DB_PATH, close };
