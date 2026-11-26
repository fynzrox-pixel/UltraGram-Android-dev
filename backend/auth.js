const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const JWT_SECRET = process.env.ULTRAGRAM_JWT || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('Set ULTRAGRAM_JWT before starting in production.'); })()
    : 'ultragram-dev-secret-change-in-prod'
);

function hashPassword(p) { return bcrypt.hashSync(p, 10); }
function verifyPassword(p, h) { return bcrypt.compareSync(p, h); }

function createToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '30d' });
}
function verifyToken(t) {
  try { return jwt.verify(t, JWT_SECRET); } catch (e) { return null; }
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || null);
  const payload = t ? verifyToken(t) : null;
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  const user = db.get('SELECT * FROM users WHERE id = ?', [payload.uid]);
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  req.token = t;
  next();
}

function isAdmin(userId) {
  const r = db.get("SELECT 1 FROM user_roles WHERE user_id=? AND role='ADMIN'", [userId]);
  return !!r;
}
function hasRole(userId, role) {
  return !!db.get('SELECT 1 FROM user_roles WHERE user_id=? AND role=?', [userId, role]);
}

function createSession(userId, device) {
  const id = uuidv4();
  const token = createToken(userId);
  const now = Date.now();
  db.run('INSERT INTO user_sessions (id,user_id,token,device,created_at,expires_at) VALUES (?,?,?,?,?,?)',
    [id, userId, token, device || 'unknown', now, now + 30*24*3600*1000]);
  return { id, token };
}

module.exports = { hashPassword, verifyPassword, createToken, verifyToken, authMiddleware, isAdmin, hasRole, createSession, JWT_SECRET };
