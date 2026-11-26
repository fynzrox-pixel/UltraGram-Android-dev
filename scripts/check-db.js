const fs = require('fs');
const initSqlJs = require('sql.js');
initSqlJs().then(SQL => {
  const buf = fs.readFileSync('database/ultragram.db');
  const db = new SQL.Database(buf);
  console.log('integrity:', JSON.stringify(db.exec('PRAGMA integrity_check')));
  console.log('tables:', db.exec("SELECT count(*) FROM sqlite_master WHERE type='table'")[0].values[0][0]);
  console.log('users:', db.exec('SELECT count(*) FROM users')[0].values[0][0]);
  console.log('gifts:', db.exec('SELECT count(*) FROM gifts')[0].values[0][0]);
  console.log('balance admin:', db.exec("SELECT balance FROM wallets WHERE user_id IN (SELECT user_id FROM user_roles WHERE role='ADMIN')")[0].values);
});
