const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const net = require('net');

let serverProcess = null;
const PORT = process.env.PORT || 8787;

function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => { sock.destroy(); if (Date.now() - start > timeout) reject(new Error('timeout')); else setTimeout(tryConnect, 500); });
      sock.on('timeout', () => { sock.destroy(); if (Date.now() - start > timeout) reject(new Error('timeout')); else setTimeout(tryConnect, 500); });
      sock.connect(port, '127.0.0.1');
    };
    tryConnect();
  });
}

function resolveServerPath() {
  const candidates = [
    path.join(__dirname, '..', 'backend', 'server.js'),
    path.join(process.resourcesPath || '', 'app', 'backend', 'server.js'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'backend', 'server.js'),
  ];
  for (const c of candidates) { try { if (require('fs').existsSync(c)) return c; } catch (e) {} }
  return candidates[0];
}
function startServer() {
  const serverPath = resolveServerPath();
  serverProcess = fork(serverPath, [], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
  serverProcess.on('exit', (code) => { console.log('server exited', code); });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    title: 'UltraGram',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    icon: path.join(__dirname, '..', 'assets', 'icon.ico')
  });
  win.loadURL(`http://127.0.0.1:${PORT}`);
  win.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  startServer();
  try { await waitForPort(PORT); } catch (e) { console.error(e); }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { if (serverProcess) serverProcess.kill(); });
