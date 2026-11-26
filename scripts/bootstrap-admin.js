// One-time secure admin bootstrap. Run: node scripts/bootstrap-admin.js
require('dotenv').config?.();
const db = require('../backend/db');
const seed = require('../backend/seed');
(async () => {
  await db.init();
  seed.seedGifts();
  seed.seedAdminBootstrap();
  console.log('Bootstrap complete. Admin: admin@ultragram.local');
  console.log('Password: ULTRAGRAM_ADMIN_PASSWORD, or the one-time value printed above.');
  db.close();
  process.exit(0);
})();
