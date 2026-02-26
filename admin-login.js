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

async function loginRequest(username, passcode, deviceId) {
  let response;
  try {
    response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, passcode, deviceId })
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
    throw new Error(payload.error || 'Login failed.');
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
