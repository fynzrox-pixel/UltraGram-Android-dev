const fs = require('fs');
const initSqlJs = require('sql.js');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('database/ultragram.db'));
  const r = db.exec("SELECT u.id, u.email, u.status, p.username, v.status FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN verification v ON v.user_id=u.id WHERE p.username='Fyn8zrox2'");
  console.log('Admin2:', JSON.stringify(r));
  const roles = db.exec("SELECT role FROM user_roles WHERE user_id='" + r[0].values[0][0] + "'");
  console.log('Roles:', JSON.stringify(roles));
  const w = db.exec("SELECT balance FROM wallets WHERE user_id='" + r[0].values[0][0] + "'");
  console.log('Wallet:', JSON.stringify(w));
});
