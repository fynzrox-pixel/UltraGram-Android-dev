const fs = require('fs');
const path = require('path');
const dbPath = process.env.ULTRAGRAM_DB || path.join(__dirname, '..', 'database', 'ultragram.db');
const backupDir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(backupDir, `ultragram-${ts}.db`);
fs.copyFileSync(dbPath, dest);
console.log('Backup created:', dest);
const files = fs.readdirSync(backupDir).filter(f => f.startsWith('ultragram-')).sort();
while (files.length > 10) { fs.unlinkSync(path.join(backupDir, files.shift())); }
