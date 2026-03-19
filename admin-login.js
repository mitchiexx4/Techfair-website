const ADMIN_SESSION_KEY = 'gimpa_tf_admin_session';
const ADMIN_DEVICE_KEY = 'gimpa_tf_admin_device_id';

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(ADMIN_DEVICE_KEY);
  if (existing) return existing;

  let randomPart = '';
  if (window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    randomPart = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    randomPart = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }

  const deviceId = `device-${randomPart}`;
  localStorage.setItem(ADMIN_DEVICE_KEY, deviceId);
  return deviceId;
}

function buildAdminLoginEndpoints() {
  const endpoints = ['/api/admin/login'];
  const localBackend = 'http://localhost:3000/api/admin/login';
  const currentOrigin = window.location.origin || '';

  if (!currentOrigin.includes('localhost:3000')) {
    endpoints.push(localBackend);
  }

  return endpoints;
}

async function postLogin(endpoint, username, passcode, deviceId) {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, passcode, deviceId })
  });
}

async function loginRequest(username, passcode, deviceId) {
  const endpoints = buildAdminLoginEndpoints();
  let response = null;
  let saw404 = false;

  for (const endpoint of endpoints) {
    try {
      const candidate = await postLogin(endpoint, username, passcode, deviceId);
      if (candidate.status === 404) {
        saw404 = true;
        continue;
      }
      response = candidate;
      break;
    } catch {
      // Try next configured endpoint.
    }
  }

  if (!response) {
    if (saw404 && endpoints.length > 1) {
      throw new Error('Backend server is not reachable on http://localhost:3000. Start it with npm start.');
    }
    throw new Error('Backend server is not reachable. Start it with npm start.');
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  let payload = {};
  let rawText = '';

  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
  } else {
    try {
      rawText = (await response.text()).trim();
    } catch {
      rawText = '';
    }
  }

  if (!response.ok || payload.ok === false) {
    const serverError = payload?.error || payload?.message || '';
    const briefText = rawText ? rawText.replace(/\s+/g, ' ').slice(0, 120) : '';
    const details = serverError || briefText;
    throw new Error(details ? `Login failed (${response.status}): ${details}` : `Login failed (${response.status}).`);
  }

  return payload;
}

function setStatus(text, isError = false) {
  const el = document.getElementById('auth-status');
  el.textContent = text;
  el.style.color = isError ? '#b42318' : '#61758a';
}

function onReady() {
  const usernameEl = document.getElementById('username');
  const passcodeEl = document.getElementById('passcode');
  const loginBtn = document.getElementById('login-btn');

  loginBtn.addEventListener('click', async () => {
    const username = (usernameEl.value || '').trim();
    const passcode = passcodeEl.value || '';
    const deviceId = getOrCreateDeviceId();

    if (!username || !passcode) {
      setStatus('Enter both username and passcode.', true);
      return;
    }

    setStatus('Signing in...');
    try {
      const data = await loginRequest(username, passcode, deviceId);
      sessionStorage.setItem(
        ADMIN_SESSION_KEY,
        JSON.stringify({
          token: data.sessionToken,
          expiresAt: data.expiresAt,
          username: data.admin?.username || username,
          deviceId
        })
      );
      window.location.href = 'admin-dashboard.html';
    } catch (error) {
      setStatus(error.message || 'Login failed.', true);
    }
  });
}

document.addEventListener('DOMContentLoaded', onReady);
