const API = '';
let state = { token: null, user: null, chats: [], currentChat: null, ws: null, view: 'chat' };

// ---- helpers ----
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers||{}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function $(id) { return document.getElementById(id); }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---- auth ----
$('tabLogin').onclick = () => { $('tabLogin').classList.add('active'); $('tabRegister').classList.remove('active'); show($('loginForm')); hide($('registerForm')); };
$('tabRegister').onclick = () => { $('tabRegister').classList.add('active'); $('tabLogin').classList.remove('active'); show($('registerForm')); hide($('loginForm')); };

function fullPhone(countrySel, phoneInput) {
  const raw = (phoneInput.value || '').trim();
  if (raw.startsWith('+')) return raw.replace(/[\s\-()]/g, '');
  const cc = countrySel.value || '';
  const digits = raw.replace(/^0+/, '').replace(/[\s\-()]/g, '');
  if (digits.startsWith(cc.replace('+', ''))) return '+' + digits;
  return cc + digits;
}

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const phone = fullPhone($('loginCountry'), $('loginPhone'));
    const data = await api('/api/auth/phone/login', { method:'POST', body: JSON.stringify({ phone, password: $('loginPassword').value }) });
    if (data.requires_2fa) {
      const code = prompt('Введите код 2FA:');
      const d2 = await api('/api/auth/2fa-login', { method:'POST', body: JSON.stringify({ phone, password: $('loginPassword').value, code }) });
      // 2fa-login expects email; fallback: use phone login not supported for 2fa here. Use email path not available. Inform.
      throw new Error('2FA login via phone not fully wired; use account email.');
    }
    state.token = data.token;
    localStorage.setItem('ug_token', data.token);
    await initApp();
  } catch (err) { $('authError').textContent = err.message; }
};
$('verifyCreateBtn').onclick = async () => {
  try {
    const phone = fullPhone($('regCountry'), $('regPhone'));
    const data = await api('/api/auth/phone/register', { method:'POST', body: JSON.stringify({
      phone,
      password: $('regPassword').value, password2: $('regPassword2').value,
      display_name: $('regName').value, username: $('regUsername').value
    }) });
    state.token = data.token;
    localStorage.setItem('ug_token', data.token);
    await initApp();
  } catch (err) { $('authError').textContent = err.message; }
};
$('loginResetBtn').onclick = async () => {
  const phone = fullPhone($('loginCountry'), $('loginPhone'));
  if (!phone) { $('authError').textContent = 'Введите номер'; return; }
  const newPass = prompt('Новый пароль:');
  if (!newPass) return;
  try {
    await api('/api/auth/phone/reset-confirm', { method:'POST', body: JSON.stringify({ phone, new_password: newPass }) });
    $('authError').textContent = 'Пароль изменён. Войдите.';
  } catch (err) { $('authError').textContent = err.message; }
};

async function initApp() {
  try {
    state.user = await api('/api/auth/me');
  } catch (e) {
    localStorage.removeItem('ug_token');
    state.token = null;
    return;
  }
  hide($('authScreen')); show($('mainApp'));
  connectWs();
  await loadChats();
  renderUserBadge();
  if (state.user.roles && state.user.roles.includes('ADMIN')) {
    show($('adminNavBtn'));
  }
  // apply saved theme
  if (state.user.profile && state.user.profile.theme) {
    document.body.className = 'theme-' + state.user.profile.theme;
  }
}

function renderUserBadge() {
  // could update sidebar footer; skip
}

// ---- WebSocket ----
function connectWs() {
  if (state.ws) state.ws.close();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  state.ws = new WebSocket(`${proto}://${location.host}/ws?token=${state.token}`);
  state.ws.onmessage = (ev) => {
    let data; try { data = JSON.parse(ev.data); } catch (e) { return; }
    handleWs(data);
  };
  state.ws.onclose = () => { setTimeout(connectWs, 3000); };
}

function handleWs(data) {
  switch (data.type) {
    case 'new_message':
      if (state.currentChat && state.currentChat.id === data.chat_id) {
        appendMessage(data.message);
      }
      // refresh chat list preview
      loadChats();
      break;
    case 'message_edited':
      if (state.currentChat && state.currentChat.id === data.chat_id) {
        const el = document.querySelector(`[data-msg-id="${data.message.id}"]`);
        if (el) { const c = el.querySelector('.content'); if (c) c.textContent = data.message.content; }
      }
      break;
    case 'message_deleted':
      if (state.currentChat && state.currentChat.id === data.chat_id) {
        const el = document.querySelector(`[data-msg-id="${data.message_id}"]`);
        if (el) el.remove();
      }
      break;
    case 'typing':
      // simple: show indicator
      break;
    case 'wallet_update':
      if (data.balance !== undefined && state.user) {
        state.user.balance = data.balance;
      }
      if (state.view === 'wallet') renderWallet();
      break;
    case 'gift_received':
      if (state.view === 'gifts') renderGifts();
      alert('Вам отправили подарок: ' + data.gift_name);
      break;
  }
}

// ---- Chats ----
async function loadChats() {
  state.chats = await api('/api/chats');
  renderChatList();
}

function renderChatList() {
  const el = $('chatList');
  el.innerHTML = '';
  const q = ($('chatSearch').value || '').toLowerCase();
  for (const c of state.chats) {
    if (q && !(c.name||'').toLowerCase().includes(q)) {
      // also search other user? skip
    }
    const div = document.createElement('div');
    div.className = 'chat-item' + (state.currentChat && state.currentChat.id === c.id ? ' active' : '');
    const name = c.type === 'dm' ? (c.other_user_id ? ('User ' + c.other_user_id.slice(0,6)) : 'DM') : (c.name || 'Chat');
    const last = c.last_message ? c.last_message.content : '';
    div.innerHTML = `<div class="chat-avatar">${(name[0]||'?').toUpperCase()}</div>
      <div class="chat-info"><div class="chat-name">${escapeHtml(name)}</div><div class="chat-last">${escapeHtml(last)}</div></div>`;
    div.onclick = () => openChat(c);
    el.appendChild(div);
  }
}
$('chatSearch').oninput = renderChatList;

async function openChat(chat) {
  state.currentChat = chat;
  state.view = 'chat';
  showView('chat');
  $('chatTitle').innerHTML = (chat.type === 'dm' ? 'Личный чат' : escapeHtml(chat.name || 'Чат')) +
    (chat.type === 'dm' && chat.other_user_id ? ` <button id="callBtn" class="btn-secondary" style="margin-left:10px;padding:4px 10px">📞 Позвонить</button>` : '');
  await loadMessages(chat.id);
  renderChatList();
}

async function loadMessages(chatId) {
  const msgs = await api(`/api/chats/${chatId}/messages?limit=100`);
  const el = $('messages');
  el.innerHTML = '';
  for (const m of msgs) appendMessage(m, false);
  el.scrollTop = el.scrollHeight;
}

function appendMessage(m, scroll = true) {
  const el = $('messages');
  const div = document.createElement('div');
  div.className = 'msg' + (m.sender_id === state.user.id ? ' own' : '');
  div.dataset.msgId = m.id;
  const name = m.sender_id === state.user.id ? 'Вы' : m.sender_id.slice(0,6);
  const reactions = m.reactions ? Object.entries(m.reactions).map(([e,n]) => `${e} ${n}`).join(' ') : '';
  div.innerHTML = `<div class="meta">${escapeHtml(name)} · ${new Date(m.created_at).toLocaleTimeString()}</div>
    <div class="content">${escapeHtml(m.content)}</div>
    <div class="reactions">${reactions}</div>`;
  // context menu: edit/delete on right click for own
  div.oncontextmenu = (e) => {
    e.preventDefault();
    if (m.sender_id === state.user.id) {
      if (confirm('Удалить сообщение?')) deleteMessage(m.id);
    }
  };
  el.appendChild(div);
  if (scroll) el.scrollTop = el.scrollHeight;
}

async function deleteMessage(id) {
  try { await api('/api/messages/' + id, { method: 'DELETE' }); } catch (e) { alert(e.message); }
}

$('sendBtn').onclick = sendMessage;
$('messageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
async function sendMessage() {
  if (!state.currentChat) return;
  const input = $('messageInput');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  try {
    await api(`/api/chats/${state.currentChat.id}/messages`, { method:'POST', body: JSON.stringify({ content }) });
  } catch (e) { alert(e.message); }
}

// enable composer when chat selected
const origOpenChat = openChat;
// patch: enable input
function enableComposer() { $('messageInput').disabled = false; $('sendBtn').disabled = false; }
// call after openChat
const _openChat = openChat;
openChat = async (chat) => { await _openChat(chat); enableComposer(); };

// ---- Views ----
function showView(name) {
  state.view = name;
  for (const v of ['chat','wallet','gifts','profile','settings','admin']) {
    const el = $(v + 'View');
    if (el) { if (v === name) show(el); else hide(el); }
  }
}
document.querySelectorAll('.nav-btn').forEach(b => {
  b.onclick = () => {
    const v = b.dataset.view;
    showView(v);
    if (v === 'wallet') renderWallet();
    if (v === 'gifts') renderGifts();
    if (v === 'profile') renderProfile();
    if (v === 'settings') renderSettings();
    if (v === 'admin') renderAdmin();
  };
});

// ---- Wallet ----
async function renderWallet() {
  const el = $('walletView');
  const w = await api('/api/wallet');
  state.user.balance = w.balance;
  el.innerHTML = `
    <h2>UltraGram Wallet</h2>
    <div class="card">
      <div class="balance">🔥 ${w.balance.toLocaleString()}</div>
      <div style="text-align:center;color:var(--muted)">Текущий баланс Огоньков</div>
    </div>
    <div class="card">
      <h3>Перевод Огоньков</h3>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input id="trTo" placeholder="ID получателя" style="flex:1;padding:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:8px">
        <input id="trAmt" type="number" placeholder="Сумма" style="width:120px;padding:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:8px">
        <button id="trBtn" class="btn-primary" style="width:auto;padding:8px 16px">Отправить</button>
      </div>
    </div>
    <div class="card">
      <h3>История операций</h3>
      <div id="txList">${w.transactions.map(t => `<div class="tx"><span>${t.type} ${t.note||''}</span><span>${t.amount} 🔥</span></div>`).join('') || '<div class="tx">Нет операций</div>'}</div>
    </div>
    <div class="card">
      <div class="stat">Потрачено: <span class="num">${w.spent}</span></div>
      <div class="stat">Получено: <span class="num">${w.received}</span></div>
    </div>`;
  $('trBtn').onclick = async () => {
    try {
      await api('/api/wallet/transfer', { method:'POST', body: JSON.stringify({ to_user: $('trTo').value, amount: parseInt($('trAmt').value), idempotency_key: crypto.randomUUID() }) });
      renderWallet();
    } catch (e) { alert(e.message); }
  };
}

// ---- Gifts ----
let giftsCache = [];
async function renderGifts() {
  const el = $('giftsView');
  giftsCache = await api('/api/gifts');
  const rarities = [...new Set(giftsCache.map(g=>g.rarity))];
  el.innerHTML = `
    <h2>Магазин подарков</h2>
    <div class="filters">
      <input id="giftSearch" placeholder="Поиск подарков">
      <select id="giftRarity"><option value="">Все редкости</option>${rarities.map(r=>`<option>${r}</option>`).join('')}</select>
      <select id="giftSort">
        <option value="price_asc">Цена ↑</option>
        <option value="price_desc">Цена ↓</option>
        <option value="name">Имя</option>
      </select>
      <button id="myGiftsBtn" class="btn-secondary">Моя коллекция</button>
    </div>
    <div id="giftGrid" class="gift-grid"></div>
    <div id="giftDetail" style="margin-top:16px"></div>`;
  const draw = () => {
    const q = ($('giftSearch').value||'').toLowerCase();
    const r = $('giftRarity').value;
    const sort = $('giftSort').value;
    let list = giftsCache.filter(g => (!q || g.name.toLowerCase().includes(q)) && (!r || g.rarity===r));
    if (sort==='price_asc') list.sort((a,b)=>a.price-b.price);
    if (sort==='price_desc') list.sort((a,b)=>b.price-a.price);
    if (sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
    $('giftGrid').innerHTML = list.map((g, idx) => `
      <div class="gift-card" data-id="${g.id}">
        <img class="nft-gift-img" src="/assets/nft-gifts/nft_gift_${(idx % 6) + 1}.jpg" alt="${escapeHtml(g.name)}" loading="lazy">
        <div class="gift-name">${escapeHtml(g.name)}</div>
        <div class="gift-price">🔥 ${g.price.toLocaleString()}</div>
        <div class="gift-rarity">${g.rarity}</div>
      </div>`).join('');
    document.querySelectorAll('.gift-card').forEach(c => {
      c.onclick = () => showGiftDetail(c.dataset.id);
    });
  };
  $('giftSearch').oninput = draw;
  $('giftRarity').onchange = draw;
  $('giftSort').onchange = draw;
  $('myGiftsBtn').onclick = renderMyGifts;
  draw();
}

async function showGiftDetail(id) {
  const g = giftsCache.find(x=>x.id===id) || await api('/api/gifts/'+id);
  const el = $('giftDetail');
  el.innerHTML = `
    <div class="card">
      <img class="gift-detail-img" src="/assets/nft-gifts/nft_gift_1.jpg" alt="${escapeHtml(g.name)}">
      <h3>${escapeHtml(g.name)}</h3>
      <p style="color:var(--muted)">${escapeHtml(g.description||'')}</p>
      <p>Редкость: <b>${g.rarity}</b> · Категория: ${g.category||''}</p>
      <p>Цена: <b style="color:var(--neon)">🔥 ${g.price.toLocaleString()}</b></p>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="buyGiftBtn" class="btn-primary" style="width:auto">Купить</button>
        <button id="sendGiftBtn" class="btn-secondary">Отправить (из коллекции)</button>
      </div>
    </div>`;
  $('buyGiftBtn').onclick = async () => {
    try { await api('/api/gifts/buy', { method:'POST', body: JSON.stringify({ gift_id: g.id }) }); alert('Куплено!'); renderWallet(); }
    catch (e) { alert(e.message); }
  };
  $('sendGiftBtn').onclick = async () => {
    const inv = await api('/api/gifts/inventory');
    const item = inv.find(i => i.gift_id === g.id);
    if (!item) { alert('У вас нет этого подарка. Купите сначала.'); return; }
    const to = prompt('ID получателя:');
    if (!to) return;
    try { await api('/api/gifts/send', { method:'POST', body: JSON.stringify({ inventory_id: item.id, to_user: to }) }); alert('Отправлено!'); }
    catch (e) { alert(e.message); }
  };
}

async function renderMyGifts() {
  const el = $('giftsView');
  const inv = await api('/api/gifts/inventory');
  el.innerHTML = `<h2>Моя коллекция подарков</h2>
    <div class="gift-grid">${inv.map(i => `
      <div class="gift-card">
        <div class="gift-emoji">🎁</div>
        <div class="gift-name">${escapeHtml(i.name)}</div>
        <div class="gift-price">🔥 ${i.price.toLocaleString()}</div>
        <div class="gift-rarity">${i.rarity} ${i.pinned?'📌':''} ${i.hidden?'🙈':''}</div>
      </div>`).join('') || '<p style="color:var(--muted)">Пусто</p>'}</div>
    <button id="backToShop" class="btn-secondary" style="margin-top:12px">Назад в магазин</button>`;
  $('backToShop').onclick = renderGifts;
}

// ---- Profile ----
async function renderProfile() {
  const el = $('profileView');
  const u = await api('/api/auth/me');
  state.user = u;
  const roles = u.roles || [];
  const ver = u.verification || 'Unverified';
  const isAdmin = roles.includes('ADMIN');
  const isVerified = ver !== 'Unverified';
  el.innerHTML = `
    <div class="profile-header">
      <div class="avatar">${(u.profile.display_name||'?')[0].toUpperCase()}</div>
      <div>
        <h2>${escapeHtml(u.profile.display_name||'')} ${isVerified? '<span class="verified-badge">🔵 Verified UltraGram</span>':''} ${isAdmin? '<span class="admin-badge">👑 ADMIN</span>':''}</h2>
        <div style="color:var(--muted)">@${escapeHtml(u.profile.username||'—')}</div>
        <div style="color:var(--muted)">${escapeHtml(u.profile.bio||'')}</div>
        <div style="margin-top:6px">🔥 Баланс: <b style="color:var(--neon)">${u.balance.toLocaleString()}</b></div>
        <div>Статус верификации: <b>${ver}</b></div>
      </div>
    </div>
    <div class="card">
      <h3>Редактировать профиль</h3>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
        <input id="pName" placeholder="Имя" value="${escapeHtml(u.profile.display_name||'')}" style="padding:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:8px">
        <input id="pUsername" placeholder="Username" value="${escapeHtml(u.profile.username||'')}" style="padding:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:8px">
        <input id="pBio" placeholder="Био" value="${escapeHtml(u.profile.bio||'')}" style="padding:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:8px">
        <button id="saveProfileBtn" class="btn-primary" style="width:auto">Сохранить</button>
      </div>
    </div>
    <div class="card">
      <h3>Мои подарки (закреплённые)</h3>
      <div id="profileGifts"></div>
    </div>`;
  $('saveProfileBtn').onclick = async () => {
    try {
      await api('/api/profile', { method:'PUT', body: JSON.stringify({ display_name: $('pName').value, username: $('pUsername').value, bio: $('pBio').value }) });
      alert('Сохранено');
      renderProfile();
    } catch (e) { alert(e.message); }
  };
  const inv = await api('/api/gifts/inventory');
  $('profileGifts').innerHTML = inv.slice(0,12).map(i => `<span style="margin-right:8px">${i.name}</span>`).join('') || 'Нет подарков';
}

// ---- Settings ----
function renderSettings() {
  const el = $('settingsView');
  el.innerHTML = `
    <h2>Настройки</h2>
    <div class="card">
      <h3>Тема оформления</h3>
      <div class="theme-grid">
        <button class="theme-btn" data-theme="dark">UltraGram Dark</button>
        <button class="theme-btn" data-theme="purple">UltraGram Purple</button>
        <button class="theme-btn" data-theme="blue">UltraGram Blue</button>
        <button class="theme-btn" data-theme="amoled">UltraGram AMOLED</button>
        <button class="theme-btn" data-theme="light">UltraGram Light</button>
        <button class="theme-btn" data-theme="neon">UltraGram Neon</button>
      </div>
    </div>
    <div class="card">
      <h3>Ghost Mode</h3>
      <label><input type="checkbox" id="ghostToggle"> Включить Ghost Mode (скрыть онлайн-статус)</label>
    </div>
    <div class="card">
      <h3>Дополнительные функции UltraGram</h3>
      <ul style="color:var(--muted);font-size:13px;line-height:1.8">
        <li>История редактирования сообщений</li>
        <li>Расширенные настройки приватности</li>
        <li>Настраиваемые вкладки</li>
        <li>Персонализация интерфейса</li>
        <li>Premium возможности</li>
      </ul>
    </div>`;
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.onclick = async () => {
      document.body.className = 'theme-' + b.dataset.theme;
      await api('/api/settings', { method:'PUT', body: JSON.stringify({ theme: b.dataset.theme }) });
      await api('/api/profile', { method:'PUT', body: JSON.stringify({ theme: b.dataset.theme }) });
    };
  });
  $('ghostToggle').onchange = async () => {
    await api('/api/settings', { method:'PUT', body: JSON.stringify({ ghost_mode: $('ghostToggle').checked ? 1 : 0 }) });
  };
}

// ---- Admin ----
async function renderAdmin() {
  const el = $('adminView');
  try {
    const d = await api('/api/admin/dashboard');
    el.innerHTML = `
      <h2>Admin Panel</h2>
      <div class="card">
        <h3>Dashboard</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <div class="stat">Пользователи: <span class="num">${d.users}</span></div>
          <div class="stat">Онлайн: <span class="num">${d.active}</span></div>
          <div class="stat">Админы: <span class="num">${d.admins}</span></div>
          <div class="stat">Верифицированные: <span class="num">${d.verified}</span></div>
          <div class="stat">Группы: <span class="num">${d.groups}</span></div>
          <div class="stat">Каналы: <span class="num">${d.channels}</span></div>
          <div class="stat">Подарки: <span class="num">${d.gifts}</span></div>
          <div class="stat">Передач подарков: <span class="num">${d.gift_transfers}</span></div>
          <div class="stat">Оборот Огоньков: <span class="num">${d.turnover}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Разделы</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-secondary" onclick="adminUsers()">Пользователи</button>
          <button class="btn-secondary" onclick="adminGifts()">Подарки</button>
          <button class="btn-secondary" onclick="adminTx()">Транзакции</button>
          <button class="btn-secondary" onclick="adminVerify()">Верификация</button>
          <button class="btn-secondary" onclick="adminCurrency()">Валюта</button>
        </div>
      </div>
      <div id="adminContent"></div>`;
  } catch (e) { el.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`; }
}

window.adminUsers = async function() {
  const users = await api('/api/admin/users');
  const c = $('adminContent');
  c.innerHTML = `<table class="admin-table"><thead><tr><th>ID</th><th>Имя</th><th>Email</th><th>Статус</th><th>Верификация</th><th>Действия</th></tr></thead><tbody>
    ${users.map(u => `<tr>
      <td>${u.id.slice(0,8)}</td>
      <td>${escapeHtml(u.display_name||'')}</td>
      <td>${escapeHtml(u.email||'')}</td>
      <td>${u.status}</td>
      <td>${u.verification}</td>
      <td>
        <button onclick="adminBlock('${u.id}')">Блок</button>
        <button onclick="adminUnblock('${u.id}')">Разблок</button>
        <button onclick="adminSetVerify('${u.id}')">Верифицировать</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
};
window.adminBlock = async (id) => { await api('/api/admin/users/'+id+'/block',{method:'POST'}); adminUsers(); };
window.adminUnblock = async (id) => { await api('/api/admin/users/'+id+'/unblock',{method:'POST'}); adminUsers(); };
window.adminSetVerify = async (id) => {
  const status = prompt('Статус (Unverified/Verified UltraGram/Official/Admin/Founder):', 'Verified UltraGram');
  if (!status) return;
  await api('/api/admin/verify',{method:'POST',body:JSON.stringify({user_id:id,status})});
  adminUsers();
};

window.adminGifts = async function() {
  const gifts = await api('/api/gifts');
  const c = $('adminContent');
  c.innerHTML = `<div style="margin-bottom:8px"><button class="btn-primary" style="width:auto" onclick="adminCreateGift()">Создать подарок</button></div>
    <table class="admin-table"><thead><tr><th>Имя</th><th>Цена</th><th>Редкость</th><th>Категория</th></tr></thead><tbody>
    ${gifts.map(g => `<tr><td>${escapeHtml(g.name)}</td><td>${g.price}</td><td>${g.rarity}</td><td>${g.category||''}</td></tr>`).join('')}
    </tbody></table>`;
};
window.adminCreateGift = async function() {
  const name = prompt('Название:');
  if (!name) return;
  const price = prompt('Цена:', '100');
  const rarity = prompt('Редкость:', 'Common');
  const category = prompt('Категория:', 'General');
  await api('/api/admin/gifts',{method:'POST',body:JSON.stringify({name,price,rarity,category})});
  adminGifts();
};

window.adminTx = async function() {
  const tx = await api('/api/admin/transactions');
  const c = $('adminContent');
  c.innerHTML = `<table class="admin-table"><thead><tr><th>Тип</th><th>От</th><th>К</th><th>Сумма</th><th>Дата</th></tr></thead><tbody>
    ${tx.map(t => `<tr><td>${t.type}</td><td>${(t.from_user||'').slice(0,8)}</td><td>${(t.to_user||'').slice(0,8)}</td><td>${t.amount}</td><td>${new Date(t.created_at).toLocaleString()}</td></tr>`).join('')}
  </tbody></table>`;
};

window.adminVerify = async function() { adminUsers(); };

window.adminCurrency = async function() {
  const c = $('adminContent');
  c.innerHTML = `
    <div class="card">
      <h3>Выдать Огоньки</h3>
      <div style="display:flex;gap:8px">
        <input id="gUser" placeholder="User ID" style="flex:1;padding:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:8px">
        <input id="gAmt" type="number" placeholder="Сумма" style="width:120px;padding:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:8px">
        <button class="btn-primary" style="width:auto" onclick="grantCur()">Выдать</button>
      </div>
    </div>`;
};
window.grantCur = async function() {
  await api('/api/admin/currency/grant',{method:'POST',body:JSON.stringify({user_id:$('gUser').value,amount:parseInt($('gAmt').value)})});
  alert('Готово');
};

// ---- New chat modal ----
$('newChatBtn').onclick = () => show($('newChatModal'));
$('closeModalBtn').onclick = () => hide($('newChatModal'));
$('createDmBtn').onclick = async () => {
  const q = $('newChatUser').value.trim();
  // search user
  const results = await api('/api/users/search?q=' + encodeURIComponent(q));
  if (!results.length) { alert('Пользователь не найден'); return; }
  const u = results[0];
  const chat = await api('/api/chats', { method:'POST', body: JSON.stringify({ type:'dm', member_ids:[u.id] }) });
  hide($('newChatModal'));
  await loadChats();
  const c = state.chats.find(x=>x.id===chat.id);
  if (c) openChat(c);
};
$('createGroupBtn').onclick = async () => {
  const name = prompt('Название группы:');
  if (!name) return;
  const chat = await api('/api/chats', { method:'POST', body: JSON.stringify({ type:'group', name }) });
  hide($('newChatModal'));
  await loadChats();
  const c = state.chats.find(x=>x.id===chat.id);
  if (c) openChat(c);
};

// ---- boot ----
const saved = localStorage.getItem('ug_token');
if (saved) { state.token = saved; initApp(); }
else { show($('authScreen')); }
// register service worker? no
// ---- WebRTC calls ----
let peerConnection = null;
let localStream = null;
let currentCallTarget = null;

function cleanupCall() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  const modal = document.getElementById('callModal'); if (modal) modal.remove();
  currentCallTarget = null;
}

function showCallModal(title, withVideo) {
  const existing = document.getElementById('callModal'); if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'callModal';
  div.className = 'modal';
  div.innerHTML = `<div class="modal-card" style="width:480px;position:relative">
    <h3>${escapeHtml(title)}</h3>
    <video id="remoteVideo" autoplay playsinline style="width:100%;background:#000;border-radius:8px"></video>
    <video id="localVideo" autoplay playsinline muted style="width:40%;position:absolute;bottom:80px;right:20px;border-radius:8px;border:2px solid var(--accent)"></video>
    <div style="display:flex;gap:8px;margin-top:8px;justify-content:center">
      <button id="muteBtn" class="btn-secondary">?? ��������</button>
      <button id="camBtn" class="btn-secondary">?? ������</button>
      <button id="hangupBtn" class="btn-primary" style="background:var(--danger)">���������</button>
    </div>
  </div>`;
  document.body.appendChild(div);
  document.getElementById('hangupBtn').onclick = () => { endCall(); };
  document.getElementById('muteBtn').onclick = () => { if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled); };
  document.getElementById('camBtn').onclick = () => { if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled); };
}

async function startCall(targetUserId, withVideo) {
  currentCallTarget = targetUserId;
  showCallModal('������...', withVideo);
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
  } catch (e) { alert('��� ������� � �����������: ' + e.message); cleanupCall(); return; }
  document.getElementById('localVideo').srcObject = localStream;
  peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
  peerConnection.ontrack = (e) => { document.getElementById('remoteVideo').srcObject = e.streams[0]; };
  peerConnection.onicecandidate = (e) => {
    if (e.candidate) sendToUserWs({ type: 'call_ice', target_user_id: targetUserId, candidate: e.candidate });
  };
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendToUserWs({ type: 'call_offer', target_user_id: targetUserId, sdp: offer, with_video: withVideo });
}

function sendToUserWs(payload) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(payload));
}

async function handleCallOffer(data) {
  currentCallTarget = data.from_user_id;
  const accept = confirm('�������� ������. �������?');
  if (!accept) { sendToUserWs({ type: 'call_end', target_user_id: data.from_user_id }); return; }
  showCallModal('������...', data.with_video);
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: data.with_video });
  } catch (e) { alert(e.message); cleanupCall(); return; }
  document.getElementById('localVideo').srcObject = localStream;
  peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
  peerConnection.ontrack = (e) => { document.getElementById('remoteVideo').srcObject = e.streams[0]; };
  peerConnection.onicecandidate = (e) => {
    if (e.candidate) sendToUserWs({ type: 'call_ice', target_user_id: data.from_user_id, candidate: e.candidate });
  };
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  sendToUserWs({ type: 'call_answer', target_user_id: data.from_user_id, sdp: answer });
}

async function handleCallAnswer(data) {
  if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
}

async function handleCallIce(data) {
  if (peerConnection && data.candidate) {
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
  }
}

function endCall() {
  if (currentCallTarget) sendToUserWs({ type: 'call_end', target_user_id: currentCallTarget });
  cleanupCall();
}

const _handleWsOrig = handleWs;
handleWs = function(data) {
  _handleWsOrig(data);
  switch (data.type) {
    case 'call_offer': handleCallOffer(data); break;
    case 'call_answer': handleCallAnswer(data); break;
    case 'call_ice': handleCallIce(data); break;
    case 'call_end': cleanupCall(); break;
  }
};

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'callBtn') {
    const chat = state.currentChat;
    if (chat && chat.other_user_id) startCall(chat.other_user_id, true);
  }
});
// ---- Voice messages & file upload ----
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function enableComposerExtras() {
  const attachBtn = document.getElementById('attachBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const fileInput = document.getElementById('fileInput');
  if (attachBtn) attachBtn.disabled = false;
  if (voiceBtn) voiceBtn.disabled = false;
  if (attachBtn) attachBtn.onclick = () => { if (fileInput) fileInput.click(); };
  if (fileInput) fileInput.onchange = async () => {
    const files = fileInput.files;
    if (!files || !files.length) return;
    for (const f of files) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];
          const up = await api('/api/upload', { method:'POST', body: JSON.stringify({ filename: f.name, data: base64, mime: f.type }) });
          if (state.currentChat) {
            await api(`/api/chats/${state.currentChat.id}/messages`, { method:'POST', body: JSON.stringify({ content: up.url, type: 'file' }) });
          }
        } catch (e) { alert(e.message); }
      };
      reader.readAsDataURL(f);
    }
    fileInput.value = '';
  };
  if (voiceBtn) voiceBtn.onclick = async () => {
    if (isRecording) {
      if (mediaRecorder) mediaRecorder.stop();
      isRecording = false;
      voiceBtn.style.background = 'var(--bg3)';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = reader.result.split(',')[1];
            const up = await api('/api/upload', { method:'POST', body: JSON.stringify({ filename: 'voice.webm', data: base64, mime: 'audio/webm' }) });
            if (state.currentChat) {
              await api(`/api/chats/${state.currentChat.id}/messages`, { method:'POST', body: JSON.stringify({ content: up.url, type: 'voice' }) });
            }
          } catch (e) { alert(e.message); }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      isRecording = true;
      voiceBtn.style.background = 'var(--danger)';
    } catch (e) { alert('��� ������� � ���������: ' + e.message); }
  };
}

const _openChatVC = openChat;
openChat = async (chat) => { await _openChatVC(chat); enableComposer(); enableComposerExtras(); };

const _appendMessageVC = appendMessage;
appendMessage = function(m, scroll) {
  if (m.type === 'file' || m.type === 'voice') {
    const el = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg' + (m.sender_id === state.user.id ? ' own' : '');
    div.dataset.msgId = m.id;
    const name = m.sender_id === state.user.id ? '��' : m.sender_id.slice(0,6);
    let mediaHtml = '';
    if (m.type === 'voice') {
      mediaHtml = '<audio controls src="' + m.content + '" style="max-width:240px"></audio>';
    } else {
      const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(m.content);
      if (isImg) mediaHtml = '<img src="' + m.content + '" style="max-width:240px;border-radius:8px" loading="lazy">';
      else mediaHtml = '<a href="' + m.content + '" target="_blank" style="color:var(--neon)">����</a>';
    }
    div.innerHTML = '<div class="meta">' + escapeHtml(name) + ' � ' + new Date(m.created_at).toLocaleTimeString() + '</div><div class="content">' + mediaHtml + '</div>';
    el.appendChild(div);
    if (scroll !== false) el.scrollTop = el.scrollHeight;
    return;
  }
  _appendMessageVC(m, scroll);
};
