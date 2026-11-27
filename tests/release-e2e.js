/*
 * End-to-end backend test for the UltraGram 1.0.0.F1 Android release.
 *
 * Runs against an isolated copy of database/ultragram.db, so the production
 * database is never modified. Covers health, registration, login, profiles,
 * chats, messages, wallet, gifts and both admin accounts.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const ROOT = path.join(__dirname, '..');
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const SOURCE_DB = path.join(ROOT, 'database', 'ultragram.db');
const TEST_DB = path.join(ROOT, 'database', 'test-release.db');
const PRIMARY_ADMIN_PASSWORD = process.env.ULTRAGRAM_ADMIN_PASSWORD || '';

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const mark = status === 'PASS' ? 'PASS' : status === 'PARTIAL' ? 'PARTIAL' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function api(method, endpoint, body, token) {
  const response = await fetch(BASE + endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: response.status, body: json };
}

async function waitForHealth(server) {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(BASE + '/api/health');
      if (response.ok) return await response.json();
    } catch (_) { /* not ready */ }
    if (server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Backend did not become healthy');
}

(async () => {
  if (!fs.existsSync(SOURCE_DB)) throw new Error('Source database not found');
  fs.copyFileSync(SOURCE_DB, TEST_DB);

  const server = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      ULTRAGRAM_DB: TEST_DB,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

  try {
    const health = await waitForHealth(server);
    record(
      'Backend health',
      health.ok === true && health.version === '1.0.0.F6' ? 'PASS' : 'FAIL',
      JSON.stringify(health)
    );

    const stamp = String(Date.now()).slice(-8);
    const phoneA = '+380' + stamp + '1';
    const phoneB = '+380' + stamp + '2';
    const password = 'ReleaseTest2026!';

    const registerA = await api('POST', '/api/auth/phone/register', {
      phone: phoneA,
      password,
      password2: password,
      display_name: 'Android Test A',
    });
    record(
      'Registration (user A)',
      registerA.status === 200 && registerA.body.token ? 'PASS' : 'FAIL',
      `HTTP ${registerA.status}`
    );
    const tokenA = registerA.body.token;
    const userA = registerA.body.user_id;

    const registerB = await api('POST', '/api/auth/phone/register', {
      phone: phoneB,
      password,
      password2: password,
      display_name: 'Android Test B',
    });
    record(
      'Registration (user B)',
      registerB.status === 200 && registerB.body.token ? 'PASS' : 'FAIL',
      `HTTP ${registerB.status}`
    );
    const tokenB = registerB.body.token;
    const userB = registerB.body.user_id;

    const loginA = await api('POST', '/api/auth/phone/login', {
      login: phoneA,
      password,
    });
    record(
      'Login by phone',
      loginA.status === 200 && !!loginA.body.token ? 'PASS' : 'FAIL',
      `HTTP ${loginA.status}`
    );

    const meA = await api('GET', '/api/auth/me', undefined, tokenA);
    record(
      'Profile /api/auth/me',
      meA.status === 200 && meA.body.id === userA ? 'PASS' : 'FAIL',
      `HTTP ${meA.status}`
    );

    const updateA = await api('PUT', '/api/profile', {
      display_name: 'Android Tester A',
      bio: 'E2E release test',
    }, tokenA);
    const meA2 = await api('GET', '/api/auth/me', undefined, tokenA);
    record(
      'Profile update',
      updateA.status === 200 &&
        meA2.body.profile &&
        meA2.body.profile.display_name === 'Android Tester A' ? 'PASS' : 'FAIL',
      `HTTP ${updateA.status}`
    );

    const chat = await api('POST', '/api/chats', {
      type: 'dm',
      member_ids: [userB],
    }, tokenA);
    record(
      'Create DM chat',
      chat.status === 200 && !!chat.body.id ? 'PASS' : 'FAIL',
      `HTTP ${chat.status}`
    );
    const chatId = chat.body.id;

    const sent = await api('POST', `/api/chats/${chatId}/messages`, {
      content: 'Hello from Android E2E',
      type: 'text',
    }, tokenA);
    record(
      'Send message',
      sent.status === 200 && sent.body.content === 'Hello from Android E2E' ? 'PASS' : 'FAIL',
      `HTTP ${sent.status}`
    );

    const messages = await api('GET', `/api/chats/${chatId}/messages`, undefined, tokenB);
    record(
      'Receive messages as other user',
      messages.status === 200 &&
        Array.isArray(messages.body) &&
        messages.body.some((m) => m.content === 'Hello from Android E2E') ? 'PASS' : 'FAIL',
      `HTTP ${messages.status}, count=${Array.isArray(messages.body) ? messages.body.length : 'n/a'}`
    );

    const chats = await api('GET', '/api/chats', undefined, tokenA);
    const listed = Array.isArray(chats.body) && chats.body.find((c) => c.id === chatId);
    record(
      'Chat list with peer profile',
      chats.status === 200 && !!listed && !!listed.other_user ? 'PASS' : 'FAIL',
      `HTTP ${chats.status}`
    );

    const wallet = await api('GET', '/api/wallet', undefined, tokenA);
    record(
      'Wallet',
      wallet.status === 200 && typeof wallet.body.balance === 'number' ? 'PASS' : 'FAIL',
      `HTTP ${wallet.status}`
    );

    const gifts = await api('GET', '/api/gifts', undefined, tokenA);
    record(
      'Gifts catalogue',
      gifts.status === 200 && Array.isArray(gifts.body) && gifts.body.length >= 100 ? 'PASS' : 'FAIL',
      `HTTP ${gifts.status}, count=${Array.isArray(gifts.body) ? gifts.body.length : 'n/a'}`
    );

    // ---- Admin checks against the copied real database ----
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(TEST_DB));
    const adminRows = [];
    const stmt = db.prepare(`SELECT u.id, u.email, u.phone, u.status,
        u.password_hash, p.username, p.display_name, v.status AS verification
      FROM users u
      JOIN user_roles r ON r.user_id = u.id AND r.role = 'ADMIN'
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN verification v ON v.user_id = u.id`);
    while (stmt.step()) adminRows.push(stmt.getAsObject());
    stmt.free();
    db.close();

    const mainAdmin = adminRows.find((a) => a.username === 'ultragram_admin');
    const secondAdmin = adminRows.find((a) => a.username === 'Fyn8zrox2');

    record(
      'Primary administrator present',
      !!mainAdmin && mainAdmin.status === 'active' && mainAdmin.verification !== 'Unverified' ? 'PASS' : 'FAIL',
      mainAdmin ? `${mainAdmin.email}, verification=${mainAdmin.verification}` : 'missing'
    );

    if (mainAdmin && PRIMARY_ADMIN_PASSWORD) {
      const adminLogin = await api('POST', '/api/auth/login', {
        login: mainAdmin.email,
        password: PRIMARY_ADMIN_PASSWORD,
      });
      const adminMe = adminLogin.status === 200 && adminLogin.body.token
        ? await api('GET', '/api/auth/me', undefined, adminLogin.body.token)
        : { status: 0, body: {} };
      record(
        'Primary admin login (email)',
        adminLogin.status === 200 &&
          Array.isArray(adminMe.body.roles) &&
          adminMe.body.roles.includes('ADMIN') ? 'PASS' : 'FAIL',
        `login HTTP ${adminLogin.status}, me HTTP ${adminMe.status}`
      );

      const adminLoginByUsername = await api('POST', '/api/auth/login', {
        login: mainAdmin.username,
        password: PRIMARY_ADMIN_PASSWORD,
      });
      record(
        'Primary admin login (username)',
        adminLoginByUsername.status === 200 && !!adminLoginByUsername.body.token ? 'PASS' : 'FAIL',
        `HTTP ${adminLoginByUsername.status}`
      );
    } else {
      record(
        'Primary admin login',
        'PARTIAL',
        'Set ULTRAGRAM_ADMIN_PASSWORD to verify the administrator password without committing it'
      );
    }

    record(
      'Second administrator present with ADMIN role',
      !!secondAdmin &&
        secondAdmin.status === 'active' &&
        secondAdmin.verification !== 'Unverified' &&
        !!secondAdmin.password_hash ? 'PASS' : 'FAIL',
      secondAdmin
        ? `${secondAdmin.email}, username=${secondAdmin.username}, verification=${secondAdmin.verification}, phone=${secondAdmin.phone || 'not set'}`
        : 'missing'
    );

    if (secondAdmin) {
      const wrongLogin = await api('POST', '/api/auth/login', {
        login: secondAdmin.email,
        password: '__not_the_real_password__',
      });
      record(
        'Second admin login path reachable (wrong password rejected)',
        wrongLogin.status === 401 ? 'PASS' : 'FAIL',
        `HTTP ${wrongLogin.status}`
      );
      record(
        'Second admin successful login',
        'PARTIAL',
        'Password is not stored anywhere in the repository; cannot verify without the credential'
      );
    }
  } catch (error) {
    record('Test run', 'FAIL', error.message);
    if (serverLog) console.error(serverLog);
  } finally {
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    try { fs.unlinkSync(TEST_DB); } catch (_) {}
  }

  const failed = results.filter((r) => r.status === 'FAIL').length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const partial = results.filter((r) => r.status === 'PARTIAL').length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, ${partial} partial`);
  process.exit(failed === 0 ? 0 : 1);
})();
