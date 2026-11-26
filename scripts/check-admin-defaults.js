// Checks only a short list of well-known default passwords against the two
// admin hashes. Prints account labels and match booleans, never the password.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');

const candidates = [
  process.env.ULTRAGRAM_ADMIN_PASSWORD,
  'admin',
  'password',
  'changeme',
  '12345678',
].filter(Boolean);

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(path.join(__dirname, '..', 'database', 'ultragram.db')));
  const rows = [];
  const st = db.prepare(`SELECT u.id, u.email, p.username, u.password_hash
    FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='ADMIN'
    LEFT JOIN user_profiles p ON p.user_id=u.id`);
  while (st.step()) rows.push(st.getAsObject());
  st.free();
  for (const row of rows) {
    let match = -1;
    for (let i = 0; i < candidates.length; i++) {
      try {
        if (bcrypt.compareSync(candidates[i], row.password_hash)) { match = i; break; }
      } catch (_) {}
    }
    console.log(JSON.stringify({
      account: row.username || row.email,
      hasPasswordHash: !!row.password_hash,
      matchesKnownDefault: match >= 0,
    }));
  }
  db.close();
})();
