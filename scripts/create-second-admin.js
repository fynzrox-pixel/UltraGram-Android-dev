const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '..', 'database', 'ultragram.db');

initSqlJs().then(SQL => {
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const email = 'fyn8zrox2@ultragram.local';
  const username = 'Fyn8zrox2';
  const tempPassword = 'Admin2Temp' + Math.random().toString(36).slice(2, 8) + '!';

  // Check if email/username already exists
  const existingEmail = db.exec("SELECT id FROM users WHERE email='" + email + "'");
  if (existingEmail.length && existingEmail[0].values.length) {
    console.log('Email already exists, skipping creation.');
    process.exit(0);
  }
  const existingUsername = db.exec("SELECT user_id FROM user_profiles WHERE username='" + username + "'");
  if (existingUsername.length && existingUsername[0].values.length) {
    console.log('Username already exists, skipping creation.');
    process.exit(0);
  }

  const uid = uuidv4();
  const now = Date.now();
  const hash = bcrypt.hashSync(tempPassword, 10);

  // Create user
  db.run('INSERT INTO users (id,email,password_hash,created_at,status) VALUES (?,?,?,?,?)',
    [uid, email, hash, now, 'active']);
  // Profile
  db.run('INSERT INTO user_profiles (user_id,display_name,username,theme) VALUES (?,?,?,?)',
    [uid, username, username, 'dark']);
  // Verification - Admin status
  db.run('INSERT INTO verification (user_id,status,granted_at) VALUES (?,?,?)',
    [uid, 'Admin', now]);
  // Wallet with 0 balance (admin can grant later)
  db.run('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)',
    [uid, 0, now]);
  // Roles
  db.run('INSERT INTO user_roles (user_id,role) VALUES (?,?)', [uid, 'ADMIN']);
  db.run('INSERT INTO user_roles (user_id,role) VALUES (?,?)', [uid, 'Verified UltraGram']);

  // Save DB
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log('=== SECOND ADMIN CREATED ===');
  console.log('Email:', email);
  console.log('Username:', username);
  console.log('User ID:', uid);
  console.log('Temp Password:', tempPassword);
  console.log('Roles: ADMIN, Verified UltraGram');
  console.log('===========================');
  console.log('SAVE THIS PASSWORD - it will not be shown again!');
});
