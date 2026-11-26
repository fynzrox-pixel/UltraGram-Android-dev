const fs = require('fs');
const initSqlJs = require('sql.js');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('database/ultragram.db'));
  const admins = db.exec("SELECT ur.user_id, u.email, u.phone, u.password_hash IS NOT NULL AS haspw FROM user_roles ur JOIN users u ON u.id=ur.user_id WHERE ur.role='ADMIN'");
  console.log('admins:', JSON.stringify(admins));
  const uid = admins[0].values[0][0];
  const roles = db.exec("SELECT role FROM user_roles WHERE user_id='" + uid + "'");
  console.log('roles:', JSON.stringify(roles));
  const ver = db.exec("SELECT status FROM verification WHERE user_id='" + uid + "'");
  console.log('ver:', JSON.stringify(ver));
  const w = db.exec("SELECT balance FROM wallets WHERE user_id='" + uid + "'");
  console.log('wallet:', JSON.stringify(w));
  // test bcrypt
  const bcrypt = require('bcryptjs');
  const row = db.exec("SELECT password_hash FROM users WHERE id='" + uid + "'");
  const hash = row[0].values[0][0];
  const configured = process.env.ULTRAGRAM_ADMIN_PASSWORD;
  console.log('configured password check:', configured ? bcrypt.compareSync(configured, hash) : 'skipped (ULTRAGRAM_ADMIN_PASSWORD not set)');
  console.log('phone normalized check:', JSON.stringify(db.exec("SELECT phone FROM users WHERE id='" + uid + "'")));
});
