const http = require('http');
const url = require('url');
const os = require('os');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const sms = require('./sms');

const dbMod = require('./db');
const auth = require('./auth');
const seed = require('./seed');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const clients = new Map();

// ---- Rate limiter (in-memory, per IP) ----
const rateBuckets = new Map();
function rateLimit(ip, key, max, windowMs) {
  const now = Date.now();
  const bucketKey = ip + ':' + key;
  let b = rateBuckets.get(bucketKey);
  if (!b || now - b.start > windowMs) { b = { start: now, count: 0 }; rateBuckets.set(bucketKey, b); }
  b.count++;
  return b.count <= max;
}
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
function sendToUser(userId, payload) {
  const set = clients.get(userId);
  if (!set) return;
  const msg = JSON.stringify(payload);
  for (const ws of set) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
}
function broadcastChat(chatId, payload, excludeUserId) {
  const members = dbMod.all('SELECT user_id FROM chat_members WHERE chat_id = ?', [chatId]);
  for (const m of members) {
    if (m.user_id === excludeUserId) continue;
    sendToUser(m.user_id, payload);
  }
}

const wss = new WebSocket.Server({ noServer: true });

function parseCookies() {}
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  applySecurityHeaders(res);
  res.end(body);
}
function sendText(res, status, text, type='text/plain') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  applySecurityHeaders(res);
  res.end(text);
}
async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 20*1024*1024) { req.destroy(); } });
    req.on('end', () => {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('application/json')) {
        try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        const p = new URLSearchParams(data);
        const o = {}; for (const [k,v] of p) o[k]=v; resolve(o);
      } else {
        resolve({ _raw: data });
      }
    });
  });
}

function serveStatic(req, res, pathname) {
  let filePath;
  if (pathname.startsWith('/uploads/')) {
    filePath = path.join(UPLOAD_DIR, pathname.slice('/uploads/'.length));
  } else {
    const rel = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, '..', 'public', rel);
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode=404; res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.svg':'image/svg+xml','.json':'application/json' };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.end(data);
  });
}

async function authFromReq(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return null;
  const payload = auth.verifyToken(t);
  if (!payload) return null;
  const user = dbMod.get('SELECT * FROM users WHERE id = ?', [payload.uid]);
  if (!user || user.status !== 'active') return null;
  return { user, token: t };
}

// Accepts email, phone or username. Used by both email and phone login
// endpoints so the Android client can authenticate any account type.
function findUserForLogin(identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim();
  if (!raw) return null;
  let user = dbMod.get('SELECT * FROM users WHERE email = ?', [raw]);
  if (!user) user = dbMod.get('SELECT * FROM users WHERE email = ?', [raw.toLowerCase()]);
  if (user) return user;
  const phone = sms.normalizePhone(raw);
  if (phone && sms.isValidPhone(phone)) {
    user = dbMod.get('SELECT * FROM users WHERE phone = ?', [phone]);
    if (user) return user;
  }
  user = dbMod.get('SELECT u.* FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE p.username = ?', [raw]);
  return user || null;
}

// ---------- TOTP helpers ----------
function base32Encode(buf) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function generateBase32Secret(len) { return base32Encode(crypto.randomBytes(len)); }
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = [];
  for (const c of str.toUpperCase().replace(/=+$/,'')) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}
function totp(secret, time = Math.floor(Date.now()/1000), step=30, digits=6) {
  const key = base32Decode(secret);
  const counter = Math.floor(time / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length-1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset+1] & 0xff) << 16 | (hmac[offset+2] & 0xff) << 8 | (hmac[offset+3] & 0xff)) % (10**digits);
  return String(code).padStart(digits,'0');
}
function verifyTotp(secret, code) {
  const now = Math.floor(Date.now()/1000);
  for (let w = -1; w <= 1; w++) {
    if (totp(secret, now + w*30) === String(code).trim()) return true;
  }
  return false;
}

// ---------- Route handlers (reuse logic) ----------
// We'll implement a dispatch table.

const routes = []; // {method, pattern: RegExp, handler: async (req,res,ctx) }
function addRoute(method, pattern, handler) {
  routes.push({ method, re: new RegExp('^' + pattern + '$'), handler });
}
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.re);
    if (m) return { r, params: m.slice(1).map(decodeURIComponent) };
  }
  return null;
}

// Helper to get user or 401
async function requireAuth(req, res) {
  const a = await authFromReq(req);
  if (!a) { sendJson(res, 401, { error: 'unauthorized' }); return null; }
  return a;
}
function requireAdmin(req, res, user) {
  if (!auth.isAdmin(user.id)) { sendJson(res, 403, { error: 'admin only' }); return false; }
  return true;
}

// ---- Auth ----
addRoute('POST', '/api/auth/register', async (req,res) => {
  const body = await readBody(req);
  const { email, password, display_name, username } = body;
  if (!email || !password) return sendJson(res,400,{error:'email and password required'});
  // password complexity removed: any non-empty password allowed
  if (dbMod.get('SELECT id FROM users WHERE email = ?', [email])) return sendJson(res,409,{error:'email already used'});
  if (username && dbMod.get('SELECT user_id FROM user_profiles WHERE username = ?', [username])) return sendJson(res,409,{error:'username taken'});
  const uid = uuidv4(); const now = Date.now();
  dbMod.run('INSERT INTO users (id,email,password_hash,created_at,status) VALUES (?,?,?,?,?)', [uid, email, auth.hashPassword(password), now, 'active']);
  dbMod.run('INSERT INTO user_profiles (user_id,display_name,username,theme) VALUES (?,?,?,?)', [uid, display_name || email.split('@')[0], username || null, 'dark']);
  dbMod.run('INSERT INTO verification (user_id,status) VALUES (?,?)', [uid, 'Unverified']);
  dbMod.run('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)', [uid, 0, now]);
  const sess = auth.createSession(uid, req.headers['user-agent']);
  sendJson(res,200,{ user_id: uid, token: sess.token });
});
addRoute('POST', '/api/auth/login', async (req,res) => {
  const body = await readBody(req);
  const { email, phone, login, password } = body;
  const user = findUserForLogin(login || email || phone);
  if (!user || !auth.verifyPassword(password || '', user.password_hash)) return sendJson(res,401,{error:'invalid credentials'});
  if (user.status !== 'active') return sendJson(res,403,{error:'account blocked'});
  if (user.totp_enabled) {
    // issue temp token valid 5 min for 2fa completion
    return sendJson(res,200,{ requires_2fa: true, user_id: user.id });
  }
  const sess = auth.createSession(user.id, req.headers['user-agent']);
  sendJson(res,200,{ user_id: user.id, token: sess.token });
});
addRoute('GET', '/api/auth/me', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const u = a.user;
  const profile = dbMod.get('SELECT * FROM user_profiles WHERE user_id = ?', [u.id]);
  const roles = dbMod.all('SELECT role FROM user_roles WHERE user_id = ?', [u.id]).map(r => r.role);
  const ver = dbMod.get('SELECT status FROM verification WHERE user_id = ?', [u.id]);
  const wallet = dbMod.get('SELECT balance FROM wallets WHERE user_id = ?', [u.id]);
  sendJson(res,200,{ id: u.id, email: u.email, phone: u.phone, profile, roles, verification: ver ? ver.status : 'Unverified', balance: wallet ? wallet.balance : 0, is_online: u.is_online });
});

// ---- Users ----
addRoute('GET', '/api/users/search', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const q = (url.parse(req.url,true).query.q || '').trim();
  if (!q) return sendJson(res,200,[]);
  const rows = dbMod.all(`SELECT u.id, p.display_name, p.username, p.avatar_url, v.status AS verification FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN verification v ON v.user_id=u.id WHERE p.display_name LIKE ? OR p.username LIKE ? OR u.email LIKE ? LIMIT 20`, [`%${q}%`,`%${q}%`,`%${q}%`]);
  sendJson(res,200,rows);
});
addRoute('GET', '/api/users/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const id = ctx.params[0];
  const u = dbMod.get('SELECT id,email,phone,status,is_online,last_seen,created_at FROM users WHERE id = ?', [id]);
  if (!u) return sendJson(res,404,{error:'not found'});
  const profile = dbMod.get('SELECT * FROM user_profiles WHERE user_id = ?', [u.id]);
  const roles = dbMod.all('SELECT role FROM user_roles WHERE user_id = ?', [u.id]).map(r => r.role);
  const ver = dbMod.get('SELECT status FROM verification WHERE user_id = ?', [u.id]);
  const wallet = dbMod.get('SELECT balance FROM wallets WHERE user_id = ?', [u.id]);
  const gc = dbMod.get('SELECT COUNT(*) AS c FROM gift_inventory WHERE user_id = ?', [u.id]);
  sendJson(res,200,{ ...u, profile, roles, verification: ver ? ver.status : 'Unverified', balance: wallet ? wallet.balance : 0, gift_count: gc ? gc.c : 0 });
});
addRoute('PUT', '/api/profile', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const { display_name, username, avatar_url, bio, theme, ghost_mode } = body;
  const uid = a.user.id;
  if (username) {
    const ex = dbMod.get('SELECT user_id FROM user_profiles WHERE username = ? AND user_id != ?', [username, uid]);
    if (ex) return sendJson(res,409,{error:'username taken'});
  }
  dbMod.run(`UPDATE user_profiles SET display_name=COALESCE(?,display_name), username=COALESCE(?,username), avatar_url=COALESCE(?,avatar_url), bio=COALESCE(?,bio), theme=COALESCE(?,theme), ghost_mode=COALESCE(?,ghost_mode) WHERE user_id=?`,
    [display_name ?? null, username ?? null, avatar_url ?? null, bio ?? null, theme ?? null, ghost_mode ?? null, uid]);
  sendJson(res,200,{ok:true});
});

// ---- Chats ----
function ensureDmChat(a,b) {
  const rows = dbMod.all(`SELECT c.id FROM chats c JOIN chat_members m1 ON m1.chat_id=c.id AND m1.user_id=? JOIN chat_members m2 ON m2.chat_id=c.id AND m2.user_id=? WHERE c.type='dm'`, [a,b]);
  if (rows.length) return rows[0].id;
  const id = uuidv4(); const now = Date.now();
  dbMod.run('INSERT INTO chats (id,type,created_at) VALUES (?,?,?)', [id,'dm',now]);
  dbMod.run('INSERT INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)', [id,a,'member',now]);
  dbMod.run('INSERT INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)', [id,b,'member',now]);
  return id;
}
addRoute('GET', '/api/chats', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const chats = dbMod.all(`SELECT c.* FROM chats c JOIN chat_members cm ON cm.chat_id=c.id WHERE cm.user_id=? ORDER BY c.created_at DESC`, [uid]);
  const out = chats.map(c => {
    const last = dbMod.get('SELECT * FROM messages WHERE chat_id=? ORDER BY created_at DESC LIMIT 1', [c.id]);
    let other = null;
    if (c.type === 'dm') {
      const m = dbMod.get('SELECT user_id FROM chat_members WHERE chat_id=? AND user_id != ?', [c.id, uid]);
      if (m) other = m.user_id;
    }
    const members = dbMod.all('SELECT user_id FROM chat_members WHERE chat_id=?', [c.id]);
    let otherUser = null;
    if (other) {
      otherUser = dbMod.get(`SELECT u.id, p.display_name, p.username, p.avatar_url, v.status AS verification
        FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
        LEFT JOIN verification v ON v.user_id=u.id WHERE u.id=?`, [other]);
    }
    return { ...c, last_message: last, members: members.map(x=>x.user_id), other_user_id: other, other_user: otherUser };
  });
  sendJson(res,200,out);
});
addRoute('POST', '/api/chats', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const { type, name, member_ids, is_public } = body;
  const uid = a.user.id;
  if (type === 'dm') {
    const other = (member_ids||[])[0];
    if (!other) return sendJson(res,400,{error:'member required'});
    const id = ensureDmChat(uid, other);
    return sendJson(res,200,{ id, type:'dm' });
  }
  const id = uuidv4(); const now = Date.now();
  const chatType = type === 'channel' ? 'channel' : 'group';
  dbMod.run('INSERT INTO chats (id,type,name,owner_id,created_at,is_public) VALUES (?,?,?,?,?,?)', [id, chatType, name || 'New chat', uid, now, is_public ? 1 : 0]);
  dbMod.run('INSERT INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)', [id, uid, 'admin', now]);
  for (const m of (member_ids||[])) {
    if (m === uid) continue;
    dbMod.run('INSERT OR IGNORE INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)', [id, m, 'member', now]);
  }
  if (chatType === 'group') dbMod.run('INSERT INTO groups (chat_id) VALUES (?)', [id]);
  if (chatType === 'channel') dbMod.run('INSERT INTO channels (chat_id) VALUES (?)', [id]);
  sendJson(res,200,{ id, type: chatType });
});
addRoute('GET', '/api/chats/([^/]+)/messages', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const chatId = ctx.params[0];
  const uid = a.user.id;
  const chat = dbMod.get('SELECT * FROM chats WHERE id=?', [chatId]);
  if (!chat) return sendJson(res,404,{error:'not found'});
  const member = dbMod.get('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?', [chatId, uid]);
  if (!member && !(chat.type === 'channel' && chat.is_public)) return sendJson(res,403,{error:'forbidden'});
  const q = url.parse(req.url,true).query;
  const limit = Math.min(parseInt(q.limit || '50'), 200);
  const before = q.before ? parseInt(q.before) : null;
  let sql = 'SELECT * FROM messages WHERE chat_id=? AND deleted=0';
  const params = [chatId];
  if (before) { sql += ' AND created_at < ?'; params.push(before); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const msgs = dbMod.all(sql, params).reverse();
  const out = msgs.map(m => {
    const reactions = dbMod.all('SELECT emoji, user_id FROM message_reactions WHERE message_id=?', [m.id]);
    const agg = {}; for (const r of reactions) agg[r.emoji] = (agg[r.emoji]||0)+1;
    return { ...m, reactions: agg, reacted_by_me: reactions.filter(r=>r.user_id===uid).map(r=>r.emoji) };
  });
  if (chat.type === 'channel') dbMod.run('UPDATE channels SET views=views+1 WHERE chat_id=?', [chatId]);
  sendJson(res,200,out);
});
addRoute('POST', '/api/chats/([^/]+)/messages', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const chatId = ctx.params[0];
  const uid = a.user.id;
  const chat = dbMod.get('SELECT * FROM chats WHERE id=?', [chatId]);
  if (!chat) return sendJson(res,404,{error:'not found'});
  const member = dbMod.get('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?', [chatId, uid]);
  if (!member && chat.type !== 'channel') return sendJson(res,403,{error:'forbidden'});
  if (chat.type === 'channel') {
    const m = dbMod.get('SELECT role FROM chat_members WHERE chat_id=? AND user_id=?', [chatId, uid]);
    if (!m || (m.role !== 'admin' && chat.owner_id !== uid)) return sendJson(res,403,{error:'forbidden'});
  }
  const body = await readBody(req);
  const { content, type, reply_to } = body;
  const id = uuidv4(); const now = Date.now();
  dbMod.run('INSERT INTO messages (id,chat_id,sender_id,content,type,reply_to,created_at) VALUES (?,?,?,?,?,?,?)', [id, chatId, uid, content || '', type || 'text', reply_to || null, now]);
  const msg = dbMod.get('SELECT * FROM messages WHERE id=?', [id]);
  const payload = { type: 'new_message', chat_id: chatId, message: msg };
  broadcastChat(chatId, payload, uid);
  sendToUser(uid, payload);
  sendJson(res,200,msg);
});
addRoute('PUT', '/api/messages/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const m = dbMod.get('SELECT * FROM messages WHERE id=?', [ctx.params[0]]);
  if (!m) return sendJson(res,404,{error:'not found'});
  if (m.sender_id !== uid && !auth.isAdmin(uid)) return sendJson(res,403,{error:'forbidden'});
  const body = await readBody(req);
  const { content } = body;
  dbMod.run('INSERT INTO message_revisions (id,message_id,content,revised_at) VALUES (?,?,?,?)', [uuidv4(), m.id, m.content, Date.now()]);
  dbMod.run('UPDATE messages SET content=?, edited=1 WHERE id=?', [content, m.id]);
  const updated = dbMod.get('SELECT * FROM messages WHERE id=?', [m.id]);
  broadcastChat(m.chat_id, { type: 'message_edited', chat_id: m.chat_id, message: updated }, null);
  sendJson(res,200,updated);
});
addRoute('DELETE', '/api/messages/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const m = dbMod.get('SELECT * FROM messages WHERE id=?', [ctx.params[0]]);
  if (!m) return sendJson(res,404,{error:'not found'});
  if (m.sender_id !== uid && !auth.isAdmin(uid)) return sendJson(res,403,{error:'forbidden'});
  dbMod.run('INSERT INTO message_revisions (id,message_id,content,revised_at) VALUES (?,?,?,?)', [uuidv4(), m.id, m.content, Date.now()]);
  dbMod.run('UPDATE messages SET deleted=1, content=? WHERE id=?', ['[deleted]', m.id]);
  broadcastChat(m.chat_id, { type: 'message_deleted', chat_id: m.chat_id, message_id: m.id }, null);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/messages/([^/]+)/reactions', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const m = dbMod.get('SELECT * FROM messages WHERE id=?', [ctx.params[0]]);
  if (!m) return sendJson(res,404,{error:'not found'});
  const body = await readBody(req);
  const { emoji, remove } = body;
  if (remove) dbMod.run('DELETE FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?', [m.id, uid, emoji]);
  else dbMod.run('INSERT OR IGNORE INTO message_reactions (message_id,user_id,emoji,created_at) VALUES (?,?,?,?)', [m.id, uid, emoji, Date.now()]);
  const reactions = dbMod.all('SELECT emoji, user_id FROM message_reactions WHERE message_id=?', [m.id]);
  const agg = {}; for (const r of reactions) agg[r.emoji] = (agg[r.emoji]||0)+1;
  broadcastChat(m.chat_id, { type: 'reaction_update', chat_id: m.chat_id, message_id: m.id, reactions: agg }, null);
  sendJson(res,200,{reactions:agg});
});
addRoute('POST', '/api/chats/([^/]+)/pin/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id; const chatId = ctx.params[0];
  const m = dbMod.get('SELECT role FROM chat_members WHERE chat_id=? AND user_id=?', [chatId, uid]);
  const chat = dbMod.get('SELECT * FROM chats WHERE id=?', [chatId]);
  if (!m || (m.role !== 'admin' && chat.owner_id !== uid) && !auth.isAdmin(uid)) return sendJson(res,403,{error:'forbidden'});
  dbMod.run('UPDATE messages SET pinned=0 WHERE chat_id=?', [chatId]);
  dbMod.run('UPDATE messages SET pinned=1 WHERE id=?', [ctx.params[1]]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/channels/([^/]+)/subscribe', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const chatId = ctx.params[0];
  const chat = dbMod.get('SELECT * FROM chats WHERE id=? AND type="channel"', [chatId]);
  if (!chat) return sendJson(res,404,{error:'not found'});
  dbMod.run('INSERT OR IGNORE INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)', [chatId, a.user.id, 'member', Date.now()]);
  sendJson(res,200,{ok:true});
});

// ---- Wallet ----
addRoute('GET', '/api/wallet', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const w = dbMod.get('SELECT * FROM wallets WHERE user_id=?', [uid]);
  const tx = dbMod.all('SELECT * FROM transactions WHERE from_user=? OR to_user=? ORDER BY created_at DESC LIMIT 50', [uid, uid]);
  const spent = dbMod.get('SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE from_user=?', [uid]);
  const received = dbMod.get('SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE to_user=?', [uid]);
  sendJson(res,200,{ balance: w ? w.balance : 0, transactions: tx, spent: spent ? spent.s : 0, received: received ? received.s : 0 });
});
addRoute('POST', '/api/wallet/transfer', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const body = await readBody(req);
  const { to_user, amount, idempotency_key } = body;
  const amt = parseInt(amount);
  if (!to_user || !amt || amt <= 0) return sendJson(res,400,{error:'invalid params'});
  if (to_user === uid) return sendJson(res,400,{error:'cannot transfer to self'});
  if (!dbMod.get('SELECT id FROM users WHERE id=?', [to_user])) return sendJson(res,404,{error:'recipient not found'});
  if (idempotency_key) {
    const existing = dbMod.get('SELECT * FROM transactions WHERE idempotency_key=?', [idempotency_key]);
    if (existing) return sendJson(res,200,{ ok: true, transaction: existing, duplicate: true });
  }
  const w = dbMod.get('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  if (!w || w.balance < amt) return sendJson(res,400,{error:'insufficient funds'});
  dbMod.run('UPDATE wallets SET balance=balance-?, updated_at=? WHERE user_id=?', [amt, Date.now(), uid]);
  const rw = dbMod.get('SELECT balance FROM wallets WHERE user_id=?', [to_user]);
  if (rw) dbMod.run('UPDATE wallets SET balance=balance+?, updated_at=? WHERE user_id=?', [amt, Date.now(), to_user]);
  else dbMod.run('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)', [to_user, amt, Date.now()]);
  const key = idempotency_key || uuidv4();
  const txId = uuidv4();
  dbMod.run('INSERT INTO transactions (id,from_user,to_user,amount,type,note,created_at,idempotency_key) VALUES (?,?,?,?,?,?,?,?)', [txId, uid, to_user, amt, 'transfer', 'Transfer', Date.now(), key]);
  sendToUser(to_user, { type: 'wallet_update', amount: amt, from: uid });
  sendToUser(uid, { type: 'wallet_update', balance: dbMod.get('SELECT balance FROM wallets WHERE user_id=?', [uid]).balance });
  sendJson(res,200,{ ok: true, transaction_id: txId });
});

// ---- Gifts ----
addRoute('GET', '/api/gifts', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const q = url.parse(req.url,true).query;
  const { search, sort, rarity, category } = q;
  let sql = 'SELECT * FROM gifts';
  const params = [];
  const conds = [];
  if (search) { conds.push('(name LIKE ? OR description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (rarity) { conds.push('rarity = ?'); params.push(rarity); }
  if (category) { conds.push('category = ?'); params.push(category); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  if (sort === 'price_asc') sql += ' ORDER BY price ASC';
  else if (sort === 'price_desc') sql += ' ORDER BY price DESC';
  else if (sort === 'name') sql += ' ORDER BY name ASC';
  else sql += ' ORDER BY price ASC';
  sendJson(res,200, dbMod.all(sql, params));
});
addRoute('GET', '/api/gifts/inventory', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const q = url.parse(req.url,true).query;
  const uid = q.user_id || a.user.id;
  const isSelf = uid === a.user.id;
  let sql = `SELECT gi.*, g.name, g.price, g.rarity, g.category, g.description FROM gift_inventory gi JOIN gifts g ON g.id = gi.gift_id WHERE gi.user_id=?`;
  if (!isSelf) sql += ' AND gi.hidden=0';
  sql += ' ORDER BY gi.acquired_at DESC';
  sendJson(res,200, dbMod.all(sql, [uid]));
});
addRoute('POST', '/api/gifts/buy', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const body = await readBody(req);
  const { gift_id } = body;
  const gift = dbMod.get('SELECT * FROM gifts WHERE id=?', [gift_id]);
  if (!gift) return sendJson(res,404,{error:'gift not found'});
  const w = dbMod.get('SELECT balance FROM wallets WHERE user_id=?', [uid]);
  if (!w || w.balance < gift.price) return sendJson(res,400,{error:'insufficient funds'});
  dbMod.run('UPDATE wallets SET balance=balance-?, updated_at=? WHERE user_id=?', [gift.price, Date.now(), uid]);
  const invId = uuidv4();
  dbMod.run('INSERT INTO gift_inventory (id,user_id,gift_id,acquired_at) VALUES (?,?,?,?)', [invId, uid, gift.id, Date.now()]);
  const txId = uuidv4();
  dbMod.run('INSERT INTO transactions (id,from_user,to_user,amount,type,note,created_at) VALUES (?,?,?,?,?,?,?)', [txId, uid, null, gift.price, 'gift_purchase', `Bought ${gift.name}`, Date.now()]);
  sendToUser(uid, { type: 'wallet_update', balance: dbMod.get('SELECT balance FROM wallets WHERE user_id=?', [uid]).balance });
  sendJson(res,200,{ ok: true, inventory_id: invId });
});
addRoute('POST', '/api/gifts/send', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const body = await readBody(req);
  const { inventory_id, to_user } = body;
  const inv = dbMod.get('SELECT * FROM gift_inventory WHERE id=? AND user_id=?', [inventory_id, uid]);
  if (!inv) return sendJson(res,404,{error:'inventory item not found'});
  if (!dbMod.get('SELECT id FROM users WHERE id=?', [to_user])) return sendJson(res,404,{error:'recipient not found'});
  dbMod.run('UPDATE gift_inventory SET user_id=? WHERE id=?', [to_user, inv.id]);
  const trId = uuidv4();
  dbMod.run('INSERT INTO gift_transfers (id,gift_inventory_id,from_user,to_user,created_at) VALUES (?,?,?,?,?)', [trId, inv.id, uid, to_user, Date.now()]);
  const gift = dbMod.get('SELECT name FROM gifts WHERE id=?', [inv.gift_id]);
  dbMod.run('INSERT INTO notifications (id,user_id,type,title,body,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), to_user, 'gift', 'Новый подарок', `Вам отправили подарок: ${gift ? gift.name : ''}`, Date.now()]);
  sendToUser(to_user, { type: 'gift_received', gift_name: gift ? gift.name : '', from: uid });
  sendJson(res,200,{ok:true});
});
addRoute('GET', '/api/gifts/inventory', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const q = url.parse(req.url,true).query;
  const uid = q.user_id || a.user.id;
  const isSelf = uid === a.user.id;
  let sql = `SELECT gi.*, g.name, g.price, g.rarity, g.category, g.description FROM gift_inventory gi JOIN gifts g ON g.id = gi.gift_id WHERE gi.user_id=?`;
  if (!isSelf) sql += ' AND gi.hidden=0';
  sql += ' ORDER BY gi.acquired_at DESC';
  sendJson(res,200, dbMod.all(sql, [uid]));
});
addRoute('GET', '/api/gifts/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const g = dbMod.get('SELECT * FROM gifts WHERE id=?', [ctx.params[0]]);
  if (!g) return sendJson(res,404,{error:'not found'});
  sendJson(res,200,g);
});
addRoute('PUT', '/api/gifts/inventory/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const uid = a.user.id;
  const inv = dbMod.get('SELECT * FROM gift_inventory WHERE id=? AND user_id=?', [ctx.params[0], uid]);
  if (!inv) return sendJson(res,404,{error:'not found'});
  const body = await readBody(req);
  const { pinned, hidden } = body;
  dbMod.run('UPDATE gift_inventory SET pinned=COALESCE(?,pinned), hidden=COALESCE(?,hidden) WHERE id=?', [pinned, hidden, inv.id]);
  sendJson(res,200,{ok:true});
});

// ---- Verification ----
addRoute('GET', '/api/verification/status/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const v = dbMod.get('SELECT status FROM verification WHERE user_id=?', [ctx.params[0]]);
  sendJson(res,200,{ status: v ? v.status : 'Unverified' });
});

// ---- Admin ----
addRoute('GET', '/api/admin/dashboard', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  const users = dbMod.get('SELECT COUNT(*) AS c FROM users');
  const active = dbMod.get('SELECT COUNT(*) AS c FROM users WHERE is_online=1');
  const admins = dbMod.get('SELECT COUNT(*) AS c FROM user_roles WHERE role="ADMIN"');
  const verified = dbMod.get('SELECT COUNT(*) AS c FROM verification WHERE status!="Unverified"');
  const groups = dbMod.get('SELECT COUNT(*) AS c FROM groups');
  const channels = dbMod.get('SELECT COUNT(*) AS c FROM channels');
  const gifts = dbMod.get('SELECT COUNT(*) AS c FROM gifts');
  const transfers = dbMod.get('SELECT COUNT(*) AS c FROM gift_transfers');
  const turnover = dbMod.get('SELECT COALESCE(SUM(amount),0) AS s FROM transactions');
  const recent = dbMod.all('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10');
  sendJson(res,200,{ users: users.c, active: active.c, admins: admins.c, verified: verified.c, groups: groups.c, channels: channels.c, gifts: gifts.c, gift_transfers: transfers.c, turnover: turnover.s, recent_transactions: recent });
});
addRoute('GET', '/api/admin/users', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  const rows = dbMod.all(`SELECT u.id,u.email,u.phone,u.status,u.is_online,u.created_at,u.last_seen, p.display_name,p.username,v.status AS verification FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN verification v ON v.user_id=u.id ORDER BY u.created_at DESC LIMIT 200`);
  sendJson(res,200,rows);
});
addRoute('POST', '/api/admin/users/([^/]+)/block', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  dbMod.run('UPDATE users SET status="blocked" WHERE id=?', [ctx.params[0]]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, 'block_user', ctx.params[0], null, Date.now()]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/admin/users/([^/]+)/unblock', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  dbMod.run('UPDATE users SET status="active" WHERE id=?', [ctx.params[0]]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, 'unblock_user', ctx.params[0], null, Date.now()]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/admin/verify', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  const body = await readBody(req);
  const { user_id, status } = body;
  dbMod.run('INSERT OR REPLACE INTO verification (user_id,status,granted_by,granted_at) VALUES (?,?,?,?)', [user_id, status, a.user.id, Date.now()]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, 'set_verification', user_id, status, Date.now()]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/admin/role', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  const body = await readBody(req);
  const { user_id, role, grant } = body;
  if (grant) dbMod.run('INSERT OR IGNORE INTO user_roles (user_id,role) VALUES (?,?)', [user_id, role]);
  else dbMod.run('DELETE FROM user_roles WHERE user_id=? AND role=?', [user_id, role]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, grant ? 'grant_role' : 'revoke_role', user_id, role, Date.now()]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/admin/currency/grant', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  const body = await readBody(req);
  const { user_id, amount } = body;
  const amt = parseInt(amount);
  if (!user_id || !amt) return sendJson(res,400,{error:'invalid'});
  const w = dbMod.get('SELECT balance FROM wallets WHERE user_id=?', [user_id]);
  if (w) dbMod.run('UPDATE wallets SET balance=balance+?, updated_at=? WHERE user_id=?', [amt, Date.now(), user_id]);
  else dbMod.run('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)', [user_id, amt, Date.now()]);
  dbMod.run('INSERT INTO transactions (id,from_user,to_user,amount,type,note,created_at) VALUES (?,?,?,?,?,?,?)', [uuidv4(), null, user_id, amt, 'admin_grant', 'Admin grant', Date.now()]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, 'grant_currency', user_id, String(amt), Date.now()]);
  sendToUser(user_id, { type: 'wallet_update', balance: dbMod.get('SELECT balance FROM wallets WHERE user_id=?', [user_id]).balance });
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/admin/currency/revoke', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  const body = await readBody(req);
  const { user_id, amount } = body;
  const amt = parseInt(amount);
  dbMod.run('UPDATE wallets SET balance=balance-?, updated_at=? WHERE user_id=?', [amt, Date.now(), user_id]);
  dbMod.run('INSERT INTO transactions (id,from_user,to_user,amount,type,note,created_at) VALUES (?,?,?,?,?,?,?)', [uuidv4(), user_id, null, amt, 'admin_revoke', 'Admin revoke', Date.now()]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, 'revoke_currency', user_id, String(amt), Date.now()]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/admin/gifts', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  const body = await readBody(req);
  const { name, description, price, rarity, category } = body;
  const id = uuidv4();
  dbMod.run('INSERT INTO gifts (id,name,description,price,rarity,category,image,animation,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [id, name, description || '', parseInt(price), rarity || 'Common', category || 'General', `gift:${name}`, 'sparkle', Date.now()]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, 'create_gift', id, name, Date.now()]);
  sendJson(res,200,{id});
});
addRoute('PUT', '/api/admin/gifts/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  const body = await readBody(req);
  const { name, description, price, rarity, category } = body;
  dbMod.run('UPDATE gifts SET name=COALESCE(?,name), description=COALESCE(?,description), price=COALESCE(?,price), rarity=COALESCE(?,rarity), category=COALESCE(?,category) WHERE id=?', [name, description, price ? parseInt(price) : null, rarity, category, ctx.params[0]]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, 'edit_gift', ctx.params[0], null, Date.now()]);
  sendJson(res,200,{ok:true});
});
addRoute('DELETE', '/api/admin/gifts/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  dbMod.run('DELETE FROM gifts WHERE id=?', [ctx.params[0]]);
  dbMod.run('INSERT INTO admin_logs (id,admin_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, 'delete_gift', ctx.params[0], null, Date.now()]);
  sendJson(res,200,{ok:true});
});
addRoute('GET', '/api/admin/transactions', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  sendJson(res,200, dbMod.all('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 500'));
});
addRoute('GET', '/api/admin/logs', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  if (!requireAdmin(req,res,a.user)) return;
  sendJson(res,200, dbMod.all('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 500'));
});
addRoute('POST', '/api/admin/bootstrap', async (req,res) => {
  const expected = process.env.ULTRAGRAM_BOOTSTRAP_SECRET;
  if (!expected) return sendJson(res,503,{error:'bootstrap disabled: set ULTRAGRAM_BOOTSTRAP_SECRET'});
  const body = await readBody(req);
  const secret = String(body.secret || '');
  const provided = Buffer.from(secret);
  const required = Buffer.from(expected);
  if (provided.length !== required.length || !crypto.timingSafeEqual(provided, required)) {
    return sendJson(res,403,{error:'forbidden'});
  }
  seed.seedAdminBootstrap();
  seed.seedGifts();
  sendJson(res,200,{ok:true});
});

// ---- Reports ----
addRoute('POST', '/api/reports', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const { target_type, target_id, reason } = body;
  dbMod.run('INSERT INTO reports (id,reporter_id,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?,?)', [uuidv4(), a.user.id, target_type, target_id, reason, Date.now()]);
  sendJson(res,200,{ok:true});
});

// ---- Calls ----
addRoute('POST', '/api/calls', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const { chat_id, type } = body;
  const id = uuidv4();
  dbMod.run('INSERT INTO calls (id,chat_id,caller_id,type,status,started_at) VALUES (?,?,?,?,?,?)', [id, chat_id || null, a.user.id, type || 'audio', 'ringing', Date.now()]);
  sendJson(res,200,{id});
});
addRoute('PUT', '/api/calls/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const { status } = body;
  if (status === 'ended') dbMod.run('UPDATE calls SET status=?, ended_at=? WHERE id=?', [status, Date.now(), ctx.params[0]]);
  else dbMod.run('UPDATE calls SET status=? WHERE id=?', [status, ctx.params[0]]);
  sendJson(res,200,{ok:true});
});
addRoute('GET', '/api/calls/history', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  sendJson(res,200, dbMod.all('SELECT * FROM calls WHERE caller_id=? ORDER BY started_at DESC LIMIT 50', [a.user.id]));
});

// ---- Premium ----
addRoute('GET', '/api/premium/plans', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  sendJson(res,200,[
    { id: 'premium_monthly', name: 'UltraGram Premium Monthly', price: 5000, features: ['Exclusive themes','Premium frames','Extra animations'] },
    { id: 'premium_yearly', name: 'UltraGram Premium Yearly', price: 50000, features: ['All premium features','Discounted'] },
  ]);
});

// ---- Settings ----
addRoute('GET', '/api/settings', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const profile = dbMod.get('SELECT theme, ghost_mode FROM user_profiles WHERE user_id=?', [a.user.id]);
  sendJson(res,200, profile || {});
});
addRoute('PUT', '/api/settings', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const { theme, ghost_mode } = body;
  dbMod.run('UPDATE user_profiles SET theme=COALESCE(?,theme), ghost_mode=COALESCE(?,ghost_mode) WHERE user_id=?', [theme, ghost_mode, a.user.id]);
  sendJson(res,200,{ok:true});
});

// ---- Upload (base64) ----
addRoute('POST', '/api/upload', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const { filename, data, mime } = body; // data base64
  if (!data) return sendJson(res,400,{error:'no file'});
  const id = uuidv4();
  const safeName = (filename || 'file').replace(/[^a-zA-Z0-9._-]/g,'_');
  const stored = id + '_' + safeName;
  const buf = Buffer.from(data, 'base64');
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
  dbMod.run('INSERT INTO media_files (id,owner_id,filename,mime,size,path,created_at) VALUES (?,?,?,?,?,?,?)', [id, a.user.id, filename || safeName, mime || 'application/octet-stream', buf.length, stored, Date.now()]);
  sendJson(res,200,{ id, url: `/uploads/${stored}` });
});

// ---- Auth extras ----
addRoute('POST', '/api/auth/change-password', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const { old_password, new_password } = body;
  if (!auth.verifyPassword(old_password, a.user.password_hash)) return sendJson(res,401,{error:'invalid old password'});
  if (!new_password) return sendJson(res,400,{error:'password required'});
  dbMod.run('UPDATE users SET password_hash=? WHERE id=?', [auth.hashPassword(new_password), a.user.id]);
  dbMod.run('DELETE FROM user_sessions WHERE user_id=?', [a.user.id]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/auth/reset-request', async (req,res) => {
  const body = await readBody(req);
  const { email } = body;
  const user = dbMod.get('SELECT id FROM users WHERE email=?', [email]);
  if (user) {
    const token = uuidv4();
    dbMod.run('UPDATE users SET password_reset_token=?, password_reset_expires=? WHERE id=?', [token, Date.now()+3600000, user.id]);
    if (process.env.NODE_ENV !== 'production') {
      console.log('Password reset token for', email, ':', token);
    }
  }
  sendJson(res,200,{ok:true, message:'If email exists, reset link sent'});
});
addRoute('POST', '/api/auth/reset-confirm', async (req,res) => {
  const body = await readBody(req);
  const { token, new_password } = body;
  const user = dbMod.get('SELECT * FROM users WHERE password_reset_token=?', [token]);
  if (!user || !user.password_reset_expires || user.password_reset_expires < Date.now()) return sendJson(res,400,{error:'invalid or expired token'});
  if (!new_password) return sendJson(res,400,{error:'password required'});
  dbMod.run('UPDATE users SET password_hash=?, password_reset_token=NULL, password_reset_expires=NULL WHERE id=?', [auth.hashPassword(new_password), user.id]);
  dbMod.run('DELETE FROM user_sessions WHERE user_id=?', [user.id]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/auth/2fa-login', async (req,res) => {
  const body = await readBody(req);
  const { email, phone, password, code } = body;
  let user = null;
  if (phone) user = dbMod.get('SELECT * FROM users WHERE phone = ?', [sms.normalizePhone(phone)]);
  else if (email) user = dbMod.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !auth.verifyPassword(password, user.password_hash)) return sendJson(res,401,{error:'invalid credentials'});
  if (!user.totp_enabled) return sendJson(res,400,{error:'2fa not enabled'});
  if (!verifyTotp(user.totp_secret, code)) return sendJson(res,401,{error:'invalid 2fa code'});
  const sess = auth.createSession(user.id, req.headers['user-agent']);
  sendJson(res,200,{ user_id: user.id, token: sess.token });
});
addRoute('POST', '/api/auth/logout', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  dbMod.run('DELETE FROM user_sessions WHERE token=?', [a.token]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/auth/logout-all', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  dbMod.run('DELETE FROM user_sessions WHERE user_id=?', [a.user.id]);
  sendJson(res,200,{ok:true});
});
addRoute('GET', '/api/sessions', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  sendJson(res,200, dbMod.all('SELECT id,device,created_at,expires_at FROM user_sessions WHERE user_id=?', [a.user.id]));
});

// ---- 2FA ----
addRoute('POST', '/api/2fa/setup', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const secret = generateBase32Secret(20);
  dbMod.run('UPDATE users SET totp_secret=?, totp_enabled=0 WHERE id=?', [secret, a.user.id]);
  const otpauth = 'otpauth://totp/UltraGram:' + encodeURIComponent(a.user.email) + '?secret=' + secret + '&issuer=UltraGram';
  sendJson(res,200,{ secret, otpauth });
});
addRoute('POST', '/api/2fa/verify', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const user = dbMod.get('SELECT totp_secret FROM users WHERE id=?', [a.user.id]);
  if (!user || !user.totp_secret) return sendJson(res,400,{error:'not set up'});
  if (!verifyTotp(user.totp_secret, body.code)) return sendJson(res,400,{error:'invalid code'});
  dbMod.run('UPDATE users SET totp_enabled=1 WHERE id=?', [a.user.id]);
  sendJson(res,200,{ok:true});
});
addRoute('POST', '/api/2fa/disable', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const user = dbMod.get('SELECT totp_secret,totp_enabled FROM users WHERE id=?', [a.user.id]);
  if (user.totp_enabled && !verifyTotp(user.totp_secret, body.code)) return sendJson(res,400,{error:'invalid code'});
  dbMod.run('UPDATE users SET totp_secret=NULL, totp_enabled=0 WHERE id=?', [a.user.id]);
  sendJson(res,200,{ok:true});
});

// ---- Google OAuth ----
addRoute('POST', '/api/auth/google', async (req,res) => {
  const body = await readBody(req);
  const { id_token } = body;
  if (!id_token) return sendJson(res,400,{error:'id_token required'});
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(id_token));
    const info = await r.json();
    if (!r.ok || !info.sub) return sendJson(res,401,{error:'invalid google token'});
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && info.aud !== clientId) return sendJson(res,401,{error:'invalid audience'});
    let user = dbMod.get('SELECT * FROM users WHERE google_sub=?', [info.sub]);
    if (!user && info.email) user = dbMod.get('SELECT * FROM users WHERE email=?', [info.email]);
    if (user) {
      dbMod.run('UPDATE users SET google_sub=? WHERE id=?', [info.sub, user.id]);
    } else {
      const uid = uuidv4(); const now = Date.now();
      dbMod.run('INSERT INTO users (id,email,google_sub,created_at,status) VALUES (?,?,?,?,?)', [uid, info.email, info.sub, now, 'active']);
      dbMod.run('INSERT INTO user_profiles (user_id,display_name,username,theme) VALUES (?,?,?,?)', [uid, info.name || (info.email||'').split('@')[0], null, 'dark']);
      dbMod.run('INSERT INTO verification (user_id,status) VALUES (?,?)', [uid, 'Unverified']);
      dbMod.run('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)', [uid, 0, now]);
      user = { id: uid };
    }
    const sess = auth.createSession(user.id, req.headers['user-agent']);
    sendJson(res,200,{ user_id: user.id, token: sess.token });
  } catch (e) {
    sendJson(res,500,{error:'google verification failed'});
  }
});

// ---- E2EE public keys ----
addRoute('PUT', '/api/keys', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  dbMod.run('UPDATE user_profiles SET public_key=? WHERE user_id=?', [body.public_key, a.user.id]);
  sendJson(res,200,{ok:true});
});
addRoute('GET', '/api/keys/([^/]+)', async (req,res,ctx) => {
  const a = await requireAuth(req,res); if(!a) return;
  const p = dbMod.get('SELECT public_key FROM user_profiles WHERE user_id=?', [ctx.params[0]]);
  sendJson(res,200,{ public_key: p ? p.public_key : null });
});

// ---- Phone authentication ----
addRoute('POST', '/api/auth/phone/request-code', async (req,res) => {
  const body = await readBody(req);
  const phone = sms.normalizePhone(body.phone);
  if (!sms.isValidPhone(phone)) return sendJson(res,400,{error:'invalid phone'});
  const purpose = body.purpose || 'register';
  if (!['register','login','reset'].includes(purpose)) return sendJson(res,400,{error:'invalid purpose'});
  // rate limit per phone
  // check existing code cooldown (60s)
  const recent = dbMod.get('SELECT * FROM phone_verifications WHERE phone=? AND purpose=? ORDER BY created_at DESC LIMIT 1', [phone, purpose]);
  if (recent && Date.now() - recent.created_at < 60000) return sendJson(res,429,{error:'please wait before requesting new code'});
  // for register, ensure phone not already used
  if (purpose === 'register') {
    const exists = dbMod.get('SELECT id FROM users WHERE phone=?', [phone]);
    if (exists) return sendJson(res,409,{error:'phone already registered'});
  }
  if (purpose === 'reset') {
    const exists = dbMod.get('SELECT id FROM users WHERE phone=?', [phone]);
    if (!exists) return sendJson(res,200,{ok:true}); // don't reveal
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const id = uuidv4();
  dbMod.run('INSERT INTO phone_verifications (id,phone,code,purpose,created_at,expires_at) VALUES (?,?,?,?,?,?)',
    [id, phone, code, purpose, Date.now(), Date.now() + 5 * 60 * 1000]);
  try { await sms.sendSms(phone, code); } catch (e) { console.error('SMS send failed', e); }
  sendJson(res,200,{ok:true, message:'code sent'});
});

addRoute('POST', '/api/auth/phone/register', async (req,res) => {
  const body = await readBody(req);
  const phone = sms.normalizePhone(body.phone);
  const { code, password, password2, display_name, username } = body;
  if (!sms.isValidPhone(phone)) return sendJson(res,400,{error:'invalid phone'});
  if (!password) return sendJson(res,400,{error:'password required'});
  if (password !== password2) return sendJson(res,400,{error:'passwords do not match'});
  // no SMS verification required
  // uniqueness
  if (dbMod.get('SELECT id FROM users WHERE phone=?', [phone])) return sendJson(res,409,{error:'phone already registered'});
  if (username && dbMod.get('SELECT user_id FROM user_profiles WHERE username=?', [username])) return sendJson(res,409,{error:'username taken'});
  const uid = uuidv4(); const now = Date.now();
  dbMod.run('INSERT INTO users (id,phone,password_hash,created_at,status) VALUES (?,?,?,?,?)', [uid, phone, auth.hashPassword(password), now, 'active']);
  dbMod.run('INSERT INTO user_profiles (user_id,display_name,username,theme) VALUES (?,?,?,?)', [uid, display_name || 'User', username || null, 'dark']);
  dbMod.run('INSERT INTO verification (user_id,status) VALUES (?,?)', [uid, 'Unverified']);
  dbMod.run('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)', [uid, 0, now]);
  const sess = auth.createSession(uid, req.headers['user-agent']);
  sendJson(res,200,{ user_id: uid, token: sess.token });
});

addRoute('POST', '/api/auth/phone/login', async (req,res) => {
  const body = await readBody(req);
  const { password } = body;
  // Backwards compatible: accepts phone, email or username in any of these fields.
  const user = findUserForLogin(body.login || body.phone || body.email);
  if (!user || !auth.verifyPassword(password || '', user.password_hash)) return sendJson(res,401,{error:'invalid credentials'});
  if (user.status !== 'active') return sendJson(res,403,{error:'account blocked'});
  if (user.totp_enabled) return sendJson(res,200,{ requires_2fa: true, user_id: user.id });
  const sess = auth.createSession(user.id, req.headers['user-agent']);
  sendJson(res,200,{ user_id: user.id, token: sess.token });
});

addRoute('POST', '/api/auth/phone/reset-confirm', async (req,res) => {
  const body = await readBody(req);
  const phone = sms.normalizePhone(body.phone);
  const { new_password } = body;
  if (!new_password) return sendJson(res,400,{error:'password required'});
  const user = dbMod.get('SELECT * FROM users WHERE phone=?', [phone]);
  if (!user) return sendJson(res,400,{error:'account not found'});
  dbMod.run('UPDATE users SET password_hash=? WHERE id=?', [auth.hashPassword(new_password), user.id]);
  dbMod.run('DELETE FROM user_sessions WHERE user_id=?', [user.id]);
  sendJson(res,200,{ok:true});
});

// ---- Migration helper: attach phone to existing email account ----
addRoute('POST', '/api/profile/attach-phone', async (req,res) => {
  const a = await requireAuth(req,res); if(!a) return;
  const body = await readBody(req);
  const phone = sms.normalizePhone(body.phone);
  const { code } = body;
  if (!sms.isValidPhone(phone)) return sendJson(res,400,{error:'invalid phone'});
  const pv = dbMod.get('SELECT * FROM phone_verifications WHERE phone=? AND purpose="register" ORDER BY created_at DESC LIMIT 1', [phone]);
  // allow attach if phone not used or same user
  const existing = dbMod.get('SELECT id FROM users WHERE phone=? AND id!=?', [phone, a.user.id]);
  if (existing) return sendJson(res,409,{error:'phone already used'});
  if (pv && !pv.used && pv.code === String(code).trim() && pv.expires_at >= Date.now()) {
    dbMod.run('UPDATE users SET phone=? WHERE id=?', [phone, a.user.id]);
    dbMod.run('UPDATE phone_verifications SET used=1 WHERE id=?', [pv.id]);
    sendJson(res,200,{ok:true});
  } else {
    sendJson(res,400,{error:'invalid or expired code'});
  }
});

// ---- Health ----
addRoute('GET', '/api/health', async (req,res) => {
  sendJson(res,200,{ ok: true, name: 'UltraGram Backend', version: '1.0.0.F6', time: Date.now() });
});

// ---- WS upgrade ----
const server = http.createServer(async (req,res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const ip = req.socket.remoteAddress || 'unknown';
  applySecurityHeaders(res);
  // basic rate limiting for API
  if (pathname.startsWith('/api/')) {
    let bucket = 'general';
    let max = 120, windowMs = 60000;
    if (pathname.startsWith('/api/auth/login') || pathname.startsWith('/api/auth/register')) { bucket='auth'; max=10; windowMs=60000; }
    if (pathname.startsWith('/api/wallet/transfer')) { bucket='transfer'; max=20; windowMs=60000; }
    if (!rateLimit(ip, bucket, max, windowMs)) {
      res.statusCode = 429;
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ error: 'too many requests' }));
      return;
    }
  }
  if (pathname === '/ws') {
    // handled by upgrade
    res.statusCode = 426;
    res.end('Upgrade required');
    return;
  }
  // API routes
  if (pathname.startsWith('/api/')) {
    const m = matchRoute(req.method, pathname);
    if (m) {
      try { await m.r.handler(req, res, { params: m.params }); }
      catch (e) { console.error(e); sendJson(res, 500, { error: 'server error' }); }
      return;
    }
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  // static
  serveStatic(req, res, pathname);
});

server.on('upgrade', (req, socket, head) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/ws') { socket.destroy(); return; }
  const token = parsed.query.token;
  const payload = auth.verifyToken(token);
  if (!payload) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  const user = dbMod.get('SELECT * FROM users WHERE id = ?', [payload.uid]);
  if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.userId = user.id;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const parsed = url.parse(req.url, true);
  const payload = auth.verifyToken(parsed.query.token);
  const user = dbMod.get('SELECT * FROM users WHERE id = ?', [payload.uid]);
  if (!clients.has(user.id)) clients.set(user.id, new Set());
  clients.get(user.id).add(ws);
  dbMod.run('UPDATE users SET is_online=1, last_seen=? WHERE id=?', [Date.now(), user.id]);
  ws.on('message', (raw) => {
    let data; try { data = JSON.parse(raw); } catch (e) { return; }
    if (data.type === 'typing') {
      broadcastChat(data.chat_id, { type: 'typing', chat_id: data.chat_id, user_id: user.id }, user.id);
    } else if (data.type === 'call_offer' || data.type === 'call_answer' || data.type === 'call_ice' || data.type === 'call_end') {
      if (data.target_user_id) sendToUser(data.target_user_id, { ...data, from_user_id: user.id });
    }
  });
  ws.on('close', () => {
    const set = clients.get(user.id);
    if (set) { set.delete(ws); if (set.size === 0) clients.delete(user.id); }
    dbMod.run('UPDATE users SET is_online=0, last_seen=? WHERE id=?', [Date.now(), user.id]);
  });
});

(async () => {
  await dbMod.init();
  seed.seedGifts();
  seed.seedAdminBootstrap();
  const PORT = process.env.PORT || 8787;
  // Bind to all interfaces so the Android emulator (10.0.2.2) and phones on
  // the same LAN can reach the backend. Override with HOST=127.0.0.1 to keep
  // it loopback-only.
  const HOST = process.env.HOST || '0.0.0.0';
  server.listen(PORT, HOST, () => {
    console.log(`UltraGram backend listening on http://${HOST}:${PORT}`);
    if (HOST === '0.0.0.0') {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            console.log(`  LAN: http://${net.address}:${PORT} (${name})`);
          }
        }
      }
      console.log(`  Android emulator: http://10.0.2.2:${PORT}`);
    }
  });
})();
