// common.js — shared helpers used across every dashboard page.

const Auth = {
  token() { return localStorage.getItem('ms_token'); },
  user() { try { return JSON.parse(localStorage.getItem('ms_user') || 'null'); } catch { return null; } },
  save(token, user) { localStorage.setItem('ms_token', token); localStorage.setItem('ms_user', JSON.stringify(user)); },
  updateUser(user) { localStorage.setItem('ms_user', JSON.stringify(user)); },
  logout() { localStorage.removeItem('ms_token'); localStorage.removeItem('ms_user'); location.href = '/login.html'; },
  requireLogin() { if (!Auth.token()) { location.href = '/login.html'; return false; } return true; },
  requireAdmin() { const u = Auth.user(); if (!Auth.token() || !u || u.role !== 'admin') { location.href = '/login.html'; return false; } return true; },
};

async function api(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = Auth.token();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let payload = body;
  if (body && !isForm) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function showToast(message, type = 'default') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3400);
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

// Try to grab a live browser location once, silently falls back if denied.
function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 4000 }
    );
  });
}

const SIDE_LINKS = [
  { href: '/dashboard.html', icon: '🏠', label: 'Dashboard' },
  { href: '/find-medicine.html', icon: '💊', label: 'Find Medicine' },
  { href: '/share-medicine.html', icon: '➕', label: 'Share Medicine' },
  { href: '/my-medicines.html', icon: '📋', label: 'My Medicines' },
  { href: '/requests.html', icon: '📦', label: 'My Requests' },
  { href: '/saved.html', icon: '❤️', label: 'Saved' },
  { href: '/notifications.html', icon: '🔔', label: 'Notifications' },
  { href: '/profile.html', icon: '👤', label: 'Profile' },
];

function renderShell(activeHref) {
  const user = Auth.user();
  if (!user) return;
  const shell = document.getElementById('app-shell-root');
  if (!shell) return;

  const links = SIDE_LINKS.map(
    (l) => `<a class="side-link ${activeHref === l.href ? 'active' : ''}" href="${l.href}"><span class="ic">${l.icon}</span>${l.label}</a>`
  ).join('');

  const adminLink = user.role === 'admin'
    ? `<a class="side-link ${activeHref === '/admin.html' ? 'active' : ''}" href="/admin.html"><span class="ic">🛡️</span>Admin Panel</a>`
    : '';

  shell.insertAdjacentHTML('afterbegin', `
    <aside class="app-sidebar">
      <div class="brand"><span class="brand-mark">💊</span>MediShare</div>
      ${links}
      ${adminLink}
      <div class="sidebar-spacer"></div>
      <div class="side-bottom">
        <a class="side-link" href="#" id="logout-link"><span class="ic">🚪</span>Logout</a>
      </div>
    </aside>
  `);

  document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
}

function renderTopbar(title) {
  const user = Auth.user();
  const bar = document.getElementById('app-topbar-root');
  if (!bar || !user) return;
  bar.innerHTML = `
    <h1>${title}</h1>
    <div class="topbar-actions">
      <button class="bell-btn" id="bell-btn" title="Notifications">🔔<span class="bell-dot" id="bell-dot"></span></button>
      <a class="avatar-pill" href="/profile.html">
        <span class="avatar-circle">${initials(user.name)}</span>
        <span style="font-size:13.5px;font-weight:600;">${user.name.split(' ')[0]}</span>
      </a>
    </div>
  `;
  document.getElementById('bell-btn').addEventListener('click', () => { location.href = '/notifications.html'; });
  refreshBellDot();
}

async function refreshBellDot() {
  const dot = document.getElementById('bell-dot');
  if (!dot) return;
  try {
    const { notifications } = await api('/notifications');
    if (notifications.some((n) => !n.read)) dot.classList.add('show');
  } catch { /* ignore on public pages */ }
}

function initShell(activeHref, title) {
  if (!Auth.requireLogin()) return false;
  renderShell(activeHref);
  renderTopbar(title);
  return true;
}

// "2 Strips", "1 Vial" — pluralizes simple unit words, leaves abbreviations like "ml" alone.
function qtyLabel(m) {
  const unit = m.unit || 'unit';
  const plural = m.quantity > 1 && !/^[a-z]{1,3}$/.test(unit) ? unit + 's' : unit;
  return `${m.quantity} ${plural}`;
}

// ---------- Save / bookmark a medicine ----------
async function toggleSave(medicineId, nowSaved) {
  try {
    if (nowSaved) await api(`/users/saved/${medicineId}`, { method: 'POST' });
    else await api(`/users/saved/${medicineId}`, { method: 'DELETE' });
    return true;
  } catch (e) {
    showToast(e.message, 'error');
    return false;
  }
}

function saveHeartHtml(medicineId, saved) {
  return `<button class="heart-btn ${saved ? 'saved' : ''}" data-save-id="${medicineId}" title="${saved ? 'Remove from saved' : 'Save for later'}" onclick="event.preventDefault(); event.stopPropagation(); handleHeartClick(this)">${saved ? '❤️' : '🤍'}</button>`;
}

async function handleHeartClick(btn) {
  const id = Number(btn.dataset.saveId);
  const wasSaved = btn.classList.contains('saved');
  const ok = await toggleSave(id, !wasSaved);
  if (ok) {
    btn.classList.toggle('saved');
    btn.textContent = wasSaved ? '🤍' : '❤️';
    btn.title = wasSaved ? 'Save for later' : 'Remove from saved';
  }
}

// ---------- In-request chat modal (shared across requests.html etc.) ----------
let _chatPollTimer = null;
let _chatRequestId = null;

function ensureChatModal() {
  if (document.getElementById('chat-modal-backdrop')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="chat-modal-backdrop">
      <div class="modal" style="display:flex; flex-direction:column; max-height:72vh;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h3 id="chat-with" style="margin:0;">Conversation</h3>
          <button class="btn btn-ghost btn-sm" id="chat-close">✕</button>
        </div>
        <div id="chat-contact-note" style="font-size:12.5px; color:var(--ink-faint); margin-bottom:10px;"></div>
        <div id="chat-thread" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding:4px 2px; min-height:180px;"></div>
        <form id="chat-form" style="display:flex; gap:8px; margin-top:12px;">
          <input type="text" id="chat-input" placeholder="Type a message…" style="flex:1; padding:10px 13px; border-radius:999px; border:1.5px solid var(--line); font-size:14px;" maxlength="1000">
          <button class="btn btn-primary btn-sm" type="submit">Send</button>
        </form>
      </div>
    </div>
  `);
  document.getElementById('chat-close').addEventListener('click', closeChatModal);
  document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !_chatRequestId) return;
    input.value = '';
    try {
      await api(`/requests/${_chatRequestId}/messages`, { method: 'POST', body: { text } });
      await loadChatThread();
    } catch (e) { showToast(e.message, 'error'); }
  });
}

async function loadChatThread() {
  if (!_chatRequestId) return;
  try {
    const { messages, request } = await api(`/requests/${_chatRequestId}/messages`);
    const thread = document.getElementById('chat-thread');
    thread.innerHTML = messages.length
      ? messages.map((m) => `<div style="align-self:${m.mine ? 'flex-end' : 'flex-start'}; max-width:78%; background:${m.mine ? 'var(--teal)' : 'var(--paper)'}; color:${m.mine ? '#fff' : 'var(--ink)'}; padding:9px 13px; border-radius:14px; font-size:13.5px;">${escapeHtmlLocal(m.text)}<div style="font-size:10.5px; opacity:.7; margin-top:3px;">${timeAgo(m.createdAt)}</div></div>`).join('')
      : `<div style="color:var(--ink-faint); font-size:13px; text-align:center; margin-top:30px;">No messages yet — say hello 👋</div>`;
    thread.scrollTop = thread.scrollHeight;

    const noteEl = document.getElementById('chat-contact-note');
    const user = Auth.user();
    const otherParty = user && request.donor?.id === user.id ? request.recipient : request.donor;
    if (request.contactVisible && otherParty?.mobile) {
      noteEl.textContent = `📞 Contact shared for handover — ${otherParty.name}: ${otherParty.mobile}`;
    } else if (request.contactVisible) {
      noteEl.textContent = `Contact unlocked — ${otherParty?.name || 'the other person'} hasn't shared a number to show here, use chat instead.`;
    } else {
      noteEl.textContent = 'Contact details unlock once the donor accepts this request.';
    }
  } catch (e) { showToast(e.message, 'error'); }
}

function openChatModal(requestId, withName) {
  ensureChatModal();
  _chatRequestId = requestId;
  document.getElementById('chat-with').textContent = `Chat about this request${withName ? ' — ' + withName : ''}`;
  document.getElementById('chat-modal-backdrop').classList.add('show');
  loadChatThread();
  clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(loadChatThread, 4000);
}

function closeChatModal() {
  document.getElementById('chat-modal-backdrop')?.classList.remove('show');
  clearInterval(_chatPollTimer);
  _chatRequestId = null;
}

function escapeHtmlLocal(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
