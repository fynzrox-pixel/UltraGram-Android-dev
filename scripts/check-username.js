const fs = require('fs');
const initSqlJs = require('sql.js');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('database/ultragram.db'));
  const r = db.exec("SELECT u.id, u.phone, u.email, p.username FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE p.username='Fyn8zrox2'");
  console.log('Fyn8zrox2 exists:', JSON.stringify(r));
  const r2 = db.exec('SELECT count(*) FROM users');
  console.log('total users:', r2[0].values[0][0]);
});
