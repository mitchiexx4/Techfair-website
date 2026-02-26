const API_BASE = '';
const TOKEN_KEY = 'gimpa_tf_admin_token';

const state = {
  registrations: [],
  categories: new Set()
};

function escapeHtml(text) {
  return (text || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvCell(value) {
  const safe = (value || '').toString().replace(/"/g, '""');
  return `"${safe}"`;
}

async function adminApiRequest(path, token) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token
      }
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

function buildPrintHtml(rows) {
  const cards = rows
    .map((r) => {
      const name = escapeHtml(r.name);
      const track = escapeHtml(r.track);
      const org = escapeHtml(r.org || 'N/A');
      const tag = escapeHtml(r.tag);
      const photo = escapeHtml(r.photo || '');
      return `
      <article class="tag-card">
        <header class="tag-head">
          <div class="event">GIMPA SOTSS Tech Fair 2026</div>
          <div class="sub">Participant ID Tag</div>
        </header>
        <img class="tag-photo" src="${photo}" alt="${name}" />
        <section class="tag-body">
          <div class="name">${name}</div>
          <div class="line">${track}</div>
          <div class="line">${org}</div>
        </section>
        <footer class="tag-foot">
          <div class="chip">${tag}</div>
          <div>Date: May 15-17, 2026</div>
          <div>Venue: GIMPA Campus</div>
        </footer>
      </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Printable Tags</title>
  <style>
    @page { size: A4; margin: 9mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Arial, sans-serif;
      color: #10243b;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8mm;
      align-items: start;
    }
    .tag-card {
      width: 86mm;
      border: 1.5px solid #d6e0eb;
      border-radius: 6mm;
      overflow: hidden;
      background: #f9fbff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .tag-head {
      padding: 4mm;
      background: #fff;
      border-bottom: 1px solid #d6e0eb;
    }
    .event { font-weight: 800; font-size: 12px; }
    .sub { color: #4c6177; font-size: 10px; margin-top: 1mm; }
    .tag-photo {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      display: block;
      background: #e9eff7;
    }
    .tag-body {
      background: #0b2f58;
      color: #e8f1fe;
      padding: 4mm;
    }
    .name {
      font-size: 14px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 2mm;
      word-break: break-word;
    }
    .line {
      font-size: 11px;
      opacity: 0.95;
      margin-bottom: 1mm;
      word-break: break-word;
    }
    .tag-foot {
      background: #0b2f58;
      color: #e8f1fe;
      font-size: 10px;
      padding: 0 4mm 4mm;
      display: grid;
      gap: 1mm;
    }
    .chip {
      width: fit-content;
      border-radius: 3mm;
      background: #fff;
      color: #0d3b69;
      padding: 1mm 2.4mm;
      font-size: 10px;
      font-weight: 800;
      margin-bottom: 1mm;
    }
  </style>
</head>
<body>
  <main class="sheet">${cards}</main>
  <script>
    window.addEventListener('load', function(){
      setTimeout(function(){ window.print(); }, 150);
    });
  <\/script>
</body>
</html>`;
}

function renderCards(rows) {
  const cards = document.getElementById('cards');
  cards.innerHTML = rows
    .map((r) => {
      const created = r.createdAt ? new Date(r.createdAt).toLocaleString() : 'N/A';
      return `
      <article class="card">
        <img class="photo" src="${escapeHtml(r.photo || '')}" alt="${escapeHtml(r.name || '')}" />
        <div class="meta">
          <div class="tag">${escapeHtml(r.tag)}</div>
          <div><strong>${escapeHtml(r.name)}</strong></div>
          <div>${escapeHtml(r.track)}</div>
          <div>${escapeHtml(r.org || 'N/A')}</div>
          <div>${escapeHtml(r.email || '')}</div>
          <div class="muted">${created}</div>
        </div>
      </article>`;
    })
    .join('\n');
}

function updateCategoryOptions(rows) {
  state.categories = new Set(rows.map((r) => (r.track || '').trim()).filter(Boolean));
  const categoryEl = document.getElementById('category');
  const current = categoryEl.value;
  const options = ['<option value="">All categories</option>']
    .concat(
      Array.from(state.categories)
        .sort((a, b) => a.localeCompare(b))
        .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    )
    .join('');
  categoryEl.innerHTML = options;
  if (current && state.categories.has(current)) {
    categoryEl.value = current;
  }
}

function setStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.color = isError ? '#b42318' : '#61758a';
}

function setCount(rows) {
  const count = document.getElementById('count');
  count.textContent = `${rows.length} tag${rows.length === 1 ? '' : 's'} loaded`;
}

function downloadCsv(rows) {
  const headers = ['tag', 'name', 'email', 'phone', 'org', 'track', 'createdAt', 'updatedAt'];
  const data = [
    headers.join(','),
    ...rows.map((r) =>
      [
        csvCell(r.tag),
        csvCell(r.name),
        csvCell(r.email),
        csvCell(r.phone),
        csvCell(r.org),
        csvCell(r.track),
        csvCell(r.createdAt),
        csvCell(r.updatedAt)
      ].join(',')
    )
  ].join('\n');

  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  const a = document.createElement('a');
  a.href = url;
  a.download = `gimpa-tech-fair-tags-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function loadRegistrations() {
  const tokenEl = document.getElementById('admin-token');
  const categoryEl = document.getElementById('category');
  const printBtn = document.getElementById('print-btn');
  const csvBtn = document.getElementById('csv-btn');

  const token = (tokenEl.value || '').trim();
  if (!token) {
    setStatus('Enter admin token first.', true);
    return;
  }

  sessionStorage.setItem(TOKEN_KEY, token);

  const category = (categoryEl.value || '').trim();
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  setStatus('Loading registrations...');

  try {
    const payload = await adminApiRequest(`/api/admin/registrations${query}`, token);
    state.registrations = payload.registrations || [];
    renderCards(state.registrations);
    setCount(state.registrations);
    printBtn.disabled = state.registrations.length === 0;
    csvBtn.disabled = state.registrations.length === 0;
    setStatus(`Loaded ${state.registrations.length} registrations.`);

    if (!category) {
      updateCategoryOptions(state.registrations);
    }
  } catch (error) {
    state.registrations = [];
    renderCards(state.registrations);
    setCount(state.registrations);
    printBtn.disabled = true;
    csvBtn.disabled = true;
    setStatus(error.message || 'Failed to load registrations.', true);
  }
}

function printRegistrations() {
  if (!state.registrations.length) return;
  const html = buildPrintHtml(state.registrations);
  const popup = window.open('', '_blank', 'width=1100,height=900');
  if (!popup) {
    setStatus('Popup blocked. Allow popups and retry print.', true);
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function onReady() {
  const loadBtn = document.getElementById('load-btn');
  const printBtn = document.getElementById('print-btn');
  const csvBtn = document.getElementById('csv-btn');
  const tokenEl = document.getElementById('admin-token');
  const savedToken = sessionStorage.getItem(TOKEN_KEY);

  if (savedToken) {
    tokenEl.value = savedToken;
  }

  loadBtn.addEventListener('click', loadRegistrations);
  printBtn.addEventListener('click', printRegistrations);
  csvBtn.addEventListener('click', () => downloadCsv(state.registrations));
}

document.addEventListener('DOMContentLoaded', onReady);
