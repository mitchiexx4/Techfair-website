const ADMIN_SESSION_KEY = 'gimpa_tf_admin_session';

function parseSession() {
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

async function apiRequest(path, options = {}) {
  const session = parseSession();
  let response;
  try {
    response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-session': session?.token || ''
      },
      ...options
    });
  } catch {
    throw new Error('Backend server is not reachable. Start it with npm start.');
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function setStatus(message, isError = false) {
  const el = document.getElementById('hackathon-status');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#b42318' : '#60758b';
}

function renderRows(rows) {
  const root = document.getElementById('hackathon-rows');
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = '<tr><td colspan="7">No hackathon confirmations yet.</td></tr>';
    return;
  }

  root.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.tag || ''}</td>
      <td>${row.name || ''}</td>
      <td>${row.email || ''}</td>
      <td>${row.phone || ''}</td>
      <td>${row.org || 'N/A'}</td>
      <td>${row.track || ''}</td>
      <td>${row.createdAt ? new Date(row.createdAt).toLocaleString() : 'N/A'}</td>
    </tr>
  `).join('');
}

async function checkSession() {
  const payload = await apiRequest('/api/admin/session');
  const whoami = document.getElementById('whoami');
  if (whoami) whoami.textContent = `Signed in as ${payload.admin?.username || 'admin'}`;
}

async function loadHackathonRows() {
  setStatus('Loading hackathon confirmations...');
  try {
    const payload = await apiRequest('/api/admin/registrations?hackathon=yes');
    const rows = payload.registrations || [];
    renderRows(rows);
    setStatus(`${rows.length} hackathon confirmation${rows.length === 1 ? '' : 's'} loaded.`);
  } catch (error) {
    renderRows([]);
    setStatus(error.message || 'Failed to load hackathon confirmations.', true);
  }
}

async function onReady() {
  const session = parseSession();
  if (!session?.token) {
    window.location.href = 'admin-login.html';
    return;
  }

  try {
    await checkSession();
  } catch {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.href = 'admin-login.html';
    return;
  }

  document.getElementById('refresh-hackathon').addEventListener('click', loadHackathonRows);
  await loadHackathonRows();
}

document.addEventListener('DOMContentLoaded', onReady);
