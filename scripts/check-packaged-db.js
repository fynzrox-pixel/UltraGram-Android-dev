const fs = require('fs');
const initSqlJs = require('sql.js');
const dbPath = 'C:/Users/Користувач/Desktop/UltraGram/dist/win-unpacked/resources/app/database/ultragram.db';
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const admins = db.exec("SELECT ur.user_id, u.email, u.phone, u.password_hash IS NOT NULL AS haspw FROM user_roles ur JOIN users u ON u.id=ur.user_id WHERE ur.role='ADMIN'");
  console.log('admins:', JSON.stringify(admins));
  if (admins.length) {
    const uid = admins[0].values[0][0];
    const bcrypt = require('bcryptjs');
    const row = db.exec("SELECT password_hash FROM users WHERE id='" + uid + "'");
    const hash = row[0].values[0][0];
    const configured = process.env.ULTRAGRAM_ADMIN_PASSWORD;
    console.log('configured password check:', configured ? bcrypt.compareSync(configured, hash) : 'skipped (ULTRAGRAM_ADMIN_PASSWORD not set)');
    console.log('users count:', db.exec('SELECT count(*) FROM users')[0].values[0][0]);
    console.log('gifts count:', db.exec('SELECT count(*) FROM gifts')[0].values[0][0]);
  }
});
