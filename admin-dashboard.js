const ADMIN_SESSION_KEY = 'gimpa_tf_admin_session';

const state = {
  session: null,
  tags: [],
  files: [],
  assets: [],
  downloadSections: [],
  easySpeakers: []
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

function parseSession() {
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setStatus(id, message, isError = false) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.style.color = isError ? '#b42318' : '#60758b';
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-session': state.session?.token || ''
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

function renderTagCards(rows) {
  const cards = document.getElementById('tag-cards');
  cards.innerHTML = rows
    .map((r) => {
      return `
      <article class="tag-card">
        <img src="${escapeHtml(r.photo || '')}" alt="${escapeHtml(r.name || '')}" />
        <div class="tag-meta">
          <div class="tag-chip">${escapeHtml(r.tag || '')}</div>
          <div><strong>${escapeHtml(r.name || '')}</strong></div>
          <div>${escapeHtml(r.track || '')}</div>
          <div>${escapeHtml(r.org || 'N/A')}</div>
        </div>
      </article>`;
    })
    .join('\n');
}

function updateTagCount() {
  const countEl = document.getElementById('tag-count');
  const n = state.tags.length;
  countEl.textContent = `${n} tag${n === 1 ? '' : 's'} loaded`;
}

function updateCategoryOptions() {
  const select = document.getElementById('tag-category');
  const current = select.value;
  const categories = Array.from(new Set(state.tags.map((t) => (t.track || '').trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  select.innerHTML =
    '<option value="">All categories</option>' +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (current && categories.includes(current)) select.value = current;
}

function csvCell(value) {
  const safe = (value || '').toString().replace(/"/g, '""');
  return `"${safe}"`;
}

function downloadTagsCsv() {
  if (!state.tags.length) return;
  const headers = ['tag', 'name', 'email', 'phone', 'org', 'track', 'createdAt', 'updatedAt'];
  const rows = state.tags.map((r) =>
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
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gimpa-tech-fair-registrant-tags.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildTagPrintHtml(rows) {
  const cards = rows
    .map((r) => {
      return `
      <article class="tag-card">
        <header class="head">
          <div class="event">GIMPA SOTSS Tech Fair 2026</div>
          <div class="sub">Participant ID Tag</div>
        </header>
        <img class="photo" src="${escapeHtml(r.photo || '')}" alt="${escapeHtml(r.name || '')}" />
        <section class="body">
          <div class="name">${escapeHtml(r.name || '')}</div>
          <div>${escapeHtml(r.track || '')}</div>
          <div>${escapeHtml(r.org || 'N/A')}</div>
        </section>
        <footer class="foot">
          <div class="chip">${escapeHtml(r.tag || '')}</div>
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
    .head { padding: 4mm; border-bottom: 1px solid #d6e0eb; }
    .event { font-weight: 800; font-size: 12px; }
    .sub { color: #4c6177; font-size: 10px; margin-top: 1mm; }
    .photo {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      display: block;
      background: #e9eff7;
    }
    .body {
      background: #0b2f58;
      color: #e8f1fe;
      padding: 4mm;
      display: grid;
      gap: 1mm;
      font-size: 11px;
    }
    .name { font-size: 14px; font-weight: 800; margin-bottom: 2mm; }
    .foot {
      background: #0b2f58;
      color: #e8f1fe;
      padding: 0 4mm 4mm;
      display: grid;
      gap: 1mm;
      font-size: 10px;
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

function printTags() {
  if (!state.tags.length) return;
  const popup = window.open('', '_blank', 'width=1100,height=900');
  if (!popup) {
    setStatus('tag-status', 'Popup blocked. Allow popups then retry.', true);
    return;
  }
  popup.document.open();
  popup.document.write(buildTagPrintHtml(state.tags));
  popup.document.close();
}

async function loadTags() {
  const category = (document.getElementById('tag-category').value || '').trim();
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  setStatus('tag-status', 'Loading tags...');
  try {
    const payload = await apiRequest(`/api/admin/registrations${query}`);
    state.tags = payload.registrations || [];
    renderTagCards(state.tags);
    updateTagCount();
    if (!category) updateCategoryOptions();
    document.getElementById('print-tags-btn').disabled = state.tags.length === 0;
    document.getElementById('csv-tags-btn').disabled = state.tags.length === 0;
    setStatus('tag-status', `Loaded ${state.tags.length} registrations.`);
  } catch (error) {
    state.tags = [];
    renderTagCards(state.tags);
    updateTagCount();
    document.getElementById('print-tags-btn').disabled = true;
    document.getElementById('csv-tags-btn').disabled = true;
    setStatus('tag-status', error.message || 'Failed to load tags.', true);
  }
}

function renderFileOptions() {
  const select = document.getElementById('file-select');
  select.innerHTML = state.files
    .map((f) => `<option value="${escapeHtml(f.path)}">${escapeHtml(f.path)}</option>`)
    .join('');
}

async function loadContentFile() {
  const filePath = (document.getElementById('file-select').value || '').trim();
  if (!filePath) {
    setStatus('file-status', 'No file selected.', true);
    return;
  }
  setStatus('file-status', `Loading ${filePath}...`);
  try {
    const payload = await apiRequest(`/api/admin/content/file?path=${encodeURIComponent(filePath)}`);
    document.getElementById('editor-content').value = payload.content || '';
    setStatus('file-status', `${filePath} loaded.`);
  } catch (error) {
    setStatus('file-status', error.message || 'Failed to load file.', true);
  }
}

async function saveContentFile() {
  const filePath = (document.getElementById('file-select').value || '').trim();
  const content = document.getElementById('editor-content').value;
  if (!filePath) {
    setStatus('file-status', 'No file selected.', true);
    return;
  }
  setStatus('file-status', `Saving ${filePath}...`);
  try {
    await apiRequest('/api/admin/content/file', {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, content })
    });
    setStatus('file-status', `${filePath} saved successfully.`);
  } catch (error) {
    setStatus('file-status', error.message || 'Failed to save file.', true);
  }
}

async function readAdminFile(filePath) {
  const payload = await apiRequest(`/api/admin/content/file?path=${encodeURIComponent(filePath)}`);
  return payload.content || '';
}

async function writeAdminFile(filePath, content) {
  await apiRequest('/api/admin/content/file', {
    method: 'PUT',
    body: JSON.stringify({ path: filePath, content })
  });
}

function toJsString(value) {
  return `'${(value || '').toString().replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function parseSpeakersData(html) {
  const match = html.match(/const\s+data\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error('Could not find speakers data block in speakers page.');
  const literal = match[1];
  let parsed = [];
  try {
    // Data is authored by admins in our own page, so this controlled eval is acceptable here.
    parsed = new Function(`"use strict"; return (${literal});`)();
  } catch {
    throw new Error('Speakers data block is invalid and could not be parsed.');
  }
  if (!Array.isArray(parsed)) throw new Error('Speakers data is not a list.');
  return { match, speakers: parsed };
}

function buildSpeakersLiteral(speakers) {
  const rows = speakers.map((s) => {
    return `      {name:${toJsString(s.name)}, role:${toJsString(s.role)}, org:${toJsString(s.org)}, topic:${toJsString(s.topic)}, img:${toJsString(s.img)}}`;
  });
  return `[\n${rows.join(',\n')}\n    ]`;
}

function renderEasySpeakersList() {
  const root = document.getElementById('easy-speaker-list');
  if (!root) return;
  if (!state.easySpeakers.length) {
    root.textContent = 'No speakers found.';
    return;
  }
  root.innerHTML = state.easySpeakers
    .map((s, i) => `${i + 1}. ${escapeHtml(s.name || 'Unknown')} - ${escapeHtml(s.role || '')} (${escapeHtml(s.org || '')})`)
    .join('<br/>');
}

async function loadEasySpeakers() {
  setStatus('easy-speaker-status', 'Loading speakers...');
  try {
    const html = await readAdminFile('pages/speakers.html');
    const parsed = parseSpeakersData(html);
    state.easySpeakers = parsed.speakers;
    renderEasySpeakersList();
    setStatus('easy-speaker-status', `${state.easySpeakers.length} speakers loaded.`);
  } catch (error) {
    setStatus('easy-speaker-status', error.message || 'Failed to load speakers.', true);
  }
}

async function addEasySpeaker() {
  const name = (document.getElementById('easy-speaker-name').value || '').trim();
  const role = (document.getElementById('easy-speaker-role').value || '').trim();
  const org = (document.getElementById('easy-speaker-org').value || '').trim();
  const topic = (document.getElementById('easy-speaker-topic').value || '').trim();
  const img = (document.getElementById('easy-speaker-img').value || '').trim();
  if (!name || !role || !org || !topic || !img) {
    setStatus('easy-speaker-status', 'Fill name, role, organization, topic, and image URL.', true);
    return;
  }

  setStatus('easy-speaker-status', 'Adding speaker...');
  try {
    const html = await readAdminFile('pages/speakers.html');
    const parsed = parseSpeakersData(html);
    const next = [...parsed.speakers, { name, role, org, topic, img }];
    const updatedLiteral = buildSpeakersLiteral(next);
    const updatedHtml = html.replace(parsed.match[1], updatedLiteral);
    await writeAdminFile('pages/speakers.html', updatedHtml);

    state.easySpeakers = next;
    renderEasySpeakersList();
    setStatus('easy-speaker-status', `${name} added successfully.`);
  } catch (error) {
    setStatus('easy-speaker-status', error.message || 'Failed to add speaker.', true);
  }
}

async function removeEasySpeaker() {
  const name = (document.getElementById('easy-speaker-remove-name').value || '').trim();
  if (!name) {
    setStatus('easy-speaker-status', 'Enter the speaker name to remove.', true);
    return;
  }

  setStatus('easy-speaker-status', `Removing ${name}...`);
  try {
    const html = await readAdminFile('pages/speakers.html');
    const parsed = parseSpeakersData(html);
    const idx = parsed.speakers.findIndex((s) => (s.name || '').toLowerCase() === name.toLowerCase());
    if (idx < 0) {
      setStatus('easy-speaker-status', `${name} not found.`, true);
      return;
    }
    const next = [...parsed.speakers];
    const removed = next.splice(idx, 1)[0];
    const updatedLiteral = buildSpeakersLiteral(next);
    const updatedHtml = html.replace(parsed.match[1], updatedLiteral);
    await writeAdminFile('pages/speakers.html', updatedHtml);

    state.easySpeakers = next;
    renderEasySpeakersList();
    setStatus('easy-speaker-status', `${removed.name} removed.`);
  } catch (error) {
    setStatus('easy-speaker-status', error.message || 'Failed to remove speaker.', true);
  }
}

function serializeHtml(doc) {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function parseScheduleDoc(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

function renderEasyScheduleList(doc) {
  const root = document.getElementById('easy-schedule-list');
  if (!root) return;
  const days = Array.from(doc.querySelectorAll('main .day'));
  const lines = [];
  days.forEach((day, idx) => {
    const dayTitle = (day.querySelector('h3')?.textContent || `Day ${idx + 1}`).trim();
    lines.push(`<strong>${escapeHtml(dayTitle)}</strong>`);
    const slots = Array.from(day.querySelectorAll('.agenda .slot'));
    if (slots.length === 0) {
      lines.push('No sessions.');
      return;
    }
    slots.forEach((slot) => {
      const time = (slot.querySelector('.time')?.textContent || '').trim();
      const title = (slot.querySelector('.title')?.textContent || '').trim();
      lines.push(`- ${escapeHtml(time)} | ${escapeHtml(title)}`);
    });
  });
  root.innerHTML = lines.join('<br/>');
}

async function loadEasySchedule() {
  setStatus('easy-schedule-status', 'Loading schedule...');
  try {
    const html = await readAdminFile('pages/schedule.html');
    const doc = parseScheduleDoc(html);
    renderEasyScheduleList(doc);
    setStatus('easy-schedule-status', 'Schedule loaded.');
  } catch (error) {
    setStatus('easy-schedule-status', error.message || 'Failed to load schedule.', true);
  }
}

function createScheduleSlot(doc, values) {
  const slot = doc.createElement('div');
  slot.className = 'slot';

  const time = doc.createElement('div');
  time.className = 'time';
  time.textContent = values.time;

  const badge = doc.createElement('div');
  badge.className = `badge ${values.badge}`;
  badge.textContent = values.badge.charAt(0).toUpperCase() + values.badge.slice(1);

  const content = doc.createElement('div');
  content.className = 'content';

  const title = doc.createElement('div');
  title.className = 'title';
  title.textContent = values.title;
  content.appendChild(title);

  if (values.speaker) {
    const sub = doc.createElement('div');
    sub.className = 'sub';
    sub.textContent = `Speaker: ${values.speaker}`;
    content.appendChild(sub);
  }

  const loc = doc.createElement('div');
  loc.className = 'loc';
  loc.textContent = values.location;
  content.appendChild(loc);

  slot.appendChild(time);
  slot.appendChild(badge);
  slot.appendChild(content);
  return slot;
}

async function addEasyScheduleSession() {
  const day = Number(document.getElementById('easy-day').value || 1);
  const time = (document.getElementById('easy-time').value || '').trim();
  const badge = (document.getElementById('easy-badge').value || 'general').trim();
  const title = (document.getElementById('easy-title').value || '').trim();
  const speaker = (document.getElementById('easy-speaker').value || '').trim();
  const location = (document.getElementById('easy-location').value || '').trim();
  if (!time || !title || !location) {
    setStatus('easy-schedule-status', 'Fill time, session title, and location.', true);
    return;
  }

  setStatus('easy-schedule-status', 'Adding session...');
  try {
    const html = await readAdminFile('pages/schedule.html');
    const doc = parseScheduleDoc(html);
    const dayCards = Array.from(doc.querySelectorAll('main .day'));
    const dayCard = dayCards[day - 1];
    if (!dayCard) throw new Error('Selected day was not found in schedule.');
    const agenda = dayCard.querySelector('.agenda');
    if (!agenda) throw new Error('Schedule structure is missing agenda container.');

    agenda.appendChild(createScheduleSlot(doc, { time, badge, title, speaker, location }));
    await writeAdminFile('pages/schedule.html', serializeHtml(doc));
    renderEasyScheduleList(doc);
    setStatus('easy-schedule-status', `Session "${title}" added to Day ${day}.`);
  } catch (error) {
    setStatus('easy-schedule-status', error.message || 'Failed to add session.', true);
  }
}

async function removeEasyScheduleSession() {
  const day = Number(document.getElementById('easy-day').value || 1);
  const titleToRemove = (document.getElementById('easy-schedule-remove-title').value || '').trim();
  if (!titleToRemove) {
    setStatus('easy-schedule-status', 'Enter the session title to remove.', true);
    return;
  }

  setStatus('easy-schedule-status', 'Removing session...');
  try {
    const html = await readAdminFile('pages/schedule.html');
    const doc = parseScheduleDoc(html);
    const dayCards = Array.from(doc.querySelectorAll('main .day'));
    const dayCard = dayCards[day - 1];
    if (!dayCard) throw new Error('Selected day was not found in schedule.');

    const slots = Array.from(dayCard.querySelectorAll('.agenda .slot'));
    const slot = slots.find((item) =>
      ((item.querySelector('.title')?.textContent || '').trim().toLowerCase() === titleToRemove.toLowerCase())
    );
    if (!slot) {
      setStatus('easy-schedule-status', `Session "${titleToRemove}" was not found in Day ${day}.`, true);
      return;
    }
    slot.remove();

    await writeAdminFile('pages/schedule.html', serializeHtml(doc));
    renderEasyScheduleList(doc);
    setStatus('easy-schedule-status', `Session "${titleToRemove}" removed from Day ${day}.`);
  } catch (error) {
    setStatus('easy-schedule-status', error.message || 'Failed to remove session.', true);
  }
}

function renderAssets() {
  const root = document.getElementById('asset-list');
  root.innerHTML = state.assets
    .map((asset) => {
      const sizeKb = Math.max(1, Math.round((asset.size || 0) / 1024));
      return `
      <div class="asset-item">
        <div>
          <div><strong>${escapeHtml(asset.fileName)}</strong></div>
          <div class="muted">${escapeHtml(asset.section || 'Lectures')} | ${sizeKb} KB | ${new Date(asset.updatedAt).toLocaleString()}</div>
          <a href="${escapeHtml(asset.url)}" target="_blank" rel="noopener">Open file</a>
        </div>
        <button data-delete="${escapeHtml(asset.fileName)}" class="btn-danger" type="button">Delete</button>
      </div>`;
    })
    .join('');

  root.querySelectorAll('button[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fileName = btn.getAttribute('data-delete') || '';
      if (!fileName) return;
      setStatus('asset-status', `Deleting ${fileName}...`);
      try {
        await apiRequest(`/api/admin/content/assets/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
        await refreshAssetList();
        setStatus('asset-status', `${fileName} deleted.`);
      } catch (error) {
        setStatus('asset-status', error.message || 'Delete failed.', true);
      }
    });
  });
}

async function refreshAssetList() {
  try {
    const payload = await apiRequest('/api/admin/content/files');
    state.files = payload.files || [];
    state.assets = payload.assets || [];
    state.downloadSections = payload.downloadSections || [];
    renderFileOptions();
    renderUploadSectionOptions();
    renderAssets();
  } catch (error) {
    setStatus('asset-status', error.message || 'Failed to refresh files.', true);
  }
}

function renderUploadSectionOptions() {
  const select = document.getElementById('asset-section');
  if (!select) return;
  const existing = select.value;
  const sections = state.downloadSections.length
    ? state.downloadSections
    : ['Lectures', 'Fact Sheets', 'Program Proceedings'];
  select.innerHTML = sections
    .map((section) => `<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`)
    .join('');
  if (sections.includes(existing)) {
    select.value = existing;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result || '').toString();
      const comma = result.indexOf(',');
      if (comma < 0) {
        reject(new Error('Could not parse file.'));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadAsset() {
  const input = document.getElementById('asset-file');
  const sectionSelect = document.getElementById('asset-section');
  const section = (sectionSelect?.value || 'Lectures').trim();
  const file = input.files && input.files[0];
  if (!file) {
    setStatus('asset-status', 'Choose a file to upload first.', true);
    return;
  }

  setStatus('asset-status', `Uploading ${file.name}...`);
  try {
    const contentBase64 = await fileToBase64(file);
    await apiRequest('/api/admin/content/assets', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, contentBase64, section })
    });
    input.value = '';
    await refreshAssetList();
    setStatus('asset-status', `${file.name} uploaded to ${section}.`);
  } catch (error) {
    setStatus('asset-status', error.message || 'Upload failed.', true);
  }
}

async function checkSession() {
  try {
    const payload = await apiRequest('/api/admin/session');
    const whoami = document.getElementById('whoami');
    whoami.textContent = `Signed in as ${payload.admin?.username || 'admin'}`;
    return true;
  } catch {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.href = 'admin-login.html';
    return false;
  }
}

async function logout() {
  try {
    await apiRequest('/api/admin/logout', { method: 'POST' });
  } catch {
    // Clear local session even if API logout fails.
  }
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.href = 'admin-login.html';
}

async function onReady() {
  state.session = parseSession();
  if (!state.session?.token) {
    window.location.href = 'admin-login.html';
    return;
  }

  const ok = await checkSession();
  if (!ok) return;

  document.getElementById('load-tags-btn').addEventListener('click', loadTags);
  document.getElementById('print-tags-btn').addEventListener('click', printTags);
  document.getElementById('csv-tags-btn').addEventListener('click', downloadTagsCsv);
  document.getElementById('load-file-btn').addEventListener('click', loadContentFile);
  document.getElementById('save-file-btn').addEventListener('click', saveContentFile);
  document.getElementById('upload-asset-btn').addEventListener('click', uploadAsset);
  document.getElementById('refresh-assets-btn').addEventListener('click', refreshAssetList);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('easy-speaker-refresh').addEventListener('click', loadEasySpeakers);
  document.getElementById('easy-speaker-add').addEventListener('click', addEasySpeaker);
  document.getElementById('easy-speaker-remove').addEventListener('click', removeEasySpeaker);
  document.getElementById('easy-schedule-refresh').addEventListener('click', loadEasySchedule);
  document.getElementById('easy-schedule-add').addEventListener('click', addEasyScheduleSession);
  document.getElementById('easy-schedule-remove').addEventListener('click', removeEasyScheduleSession);

  await refreshAssetList();
  await loadEasySpeakers();
  await loadEasySchedule();
}

document.addEventListener('DOMContentLoaded', onReady);
