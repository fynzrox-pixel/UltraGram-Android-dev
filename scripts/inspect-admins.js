// Read-only inspection of admin accounts. Never prints password hashes or tokens.
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const dbPath = process.env.ULTRAGRAM_DB || path.join(__dirname, '..', 'database', 'ultragram.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const q = (sql, params = []) => {
    const st = db.prepare(sql); st.bind(params);
    const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free(); return rows;
  };
  console.log('DB:', dbPath);
  const users = q(`SELECT u.id, u.email, u.phone, u.status, u.created_at,
      CASE WHEN u.password_hash IS NULL OR u.password_hash='' THEN 0 ELSE 1 END AS has_password,
      p.display_name, p.username, v.status AS verification
    FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN verification v ON v.user_id = u.id
    ORDER BY u.created_at ASC`);
  console.log('USERS:', users.length);
  for (const u of users) {
    const roles = q('SELECT role FROM user_roles WHERE user_id=?', [u.id]).map(r => r.role);
    console.log(JSON.stringify({ ...u, roles }));
  }
  console.log('ADMIN ROLE ROWS:', JSON.stringify(q("SELECT user_id, role FROM user_roles WHERE role='ADMIN'")));
  console.log('ADMIN USERS:', JSON.stringify(q(`SELECT u.id, u.email, u.phone, p.username, p.display_name, v.status AS verification
    FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='ADMIN'
    LEFT JOIN user_profiles p ON p.user_id=u.id
    LEFT JOIN verification v ON v.user_id=u.id`)));
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
