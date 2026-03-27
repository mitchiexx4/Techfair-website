// Simple in-browser storage keys
const KEY_REG = 'gimpa_tf_registrations_v1';
const KEY_SUB = 'gimpa_tf_submissions_v1';
const SESSION_REG_COMPLETE = 'gimpa_tf_registration_complete';
const SESSION_REG_TRACK = 'gimpa_tf_registration_track';
const SESSION_REG_HACKATHON = 'gimpa_tf_registration_hackathon';

function load(key){
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function save(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }
const API_BASE = '';

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch {
    throw new Error('Backend server is not reachable. Start the Node server with npm start.');
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || payload.ok === false) {
    const message =
      response.status === 404
        ? 'API route not found. Open the site via the Node server (http://localhost:3000), not Live Server.'
        : (payload.error || `Request failed (${response.status})`);
    throw new Error(message);
  }

  return payload;
}

async function saveRegistrationRemote(data) {
  const res = await apiRequest('/api/registrations', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  return res.registration;
}

async function fetchRegistrationRemote(tag) {
  const res = await apiRequest(`/api/registrations/${encodeURIComponent(tag)}`);
  return res.registration;
}

async function saveSubmissionRemote(data) {
  const res = await apiRequest('/api/submissions', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  return res.submission;
}

async function fetchSubmissionRemote(tag) {
  const res = await apiRequest(`/api/submissions/${encodeURIComponent(tag)}`);
  return res.submission;
}

function randTag(){
  const part = () => Math.random().toString(36).slice(2,6).toUpperCase();
  return `TAG-${part()}${part()}`;
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result?.toString() || '');
    reader.onerror = () => reject(new Error('Could not read photo file.'));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(text){
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadImage(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}

function hoursSince(dateText){
  const value = new Date(dateText).getTime();
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - value) / (1000 * 60 * 60);
}

function canEditSubmission(submission){
  return !!submission && hoursSince(submission.createdAt) <= 24;
}

function triggerDownload(filename, dataUrl){
  if(!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename || 'project-proposal';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function drawRoundedRect(ctx, x, y, w, h, r){
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function buildTagSnapshot(values){
  const width = 900;
  const height = 1600;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if(!ctx) return '';

  // Outer card
  drawRoundedRect(ctx, 8, 8, width - 16, height - 16, 42);
  ctx.fillStyle = '#f9fbff';
  ctx.fill();
  ctx.strokeStyle = '#d8e1ee';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Blue lower background
  const lowerStart = 470;
  const grad = ctx.createLinearGradient(0, lowerStart, 0, height);
  grad.addColorStop(0, '#0b2f58');
  grad.addColorStop(1, '#082645');
  drawRoundedRect(ctx, 14, lowerStart, width - 28, height - lowerStart - 14, 0);
  ctx.fillStyle = grad;
  ctx.fill();

  // Header text
  ctx.fillStyle = '#10243b';
  const headerText = 'GIMPA SOTSS Tech Fair 2026';
  const headerMaxWidth = width - 112;
  let headerFontSize = 62;
  ctx.font = `800 ${headerFontSize}px Inter, Arial, sans-serif`;
  while(ctx.measureText(headerText).width > headerMaxWidth && headerFontSize > 40){
    headerFontSize -= 2;
    ctx.font = `800 ${headerFontSize}px Inter, Arial, sans-serif`;
  }
  ctx.fillText(headerText, 56, 120);
  ctx.fillStyle = '#425366';
  ctx.font = '600 40px Inter, Arial, sans-serif';
  ctx.fillText('Participant ID Tag', 56, 176);

  // Photo frame
  const photoX = 56;
  const photoY = 220;
  const photoSize = width - 112;
  drawRoundedRect(ctx, photoX, photoY, photoSize, photoSize, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#e56f4e';
  ctx.stroke();

  // Photo image
  const img = await loadImage(values.photo);
  const innerPad = 12;
  drawRoundedRect(ctx, photoX + innerPad, photoY + innerPad, photoSize - innerPad * 2, photoSize - innerPad * 2, 20);
  ctx.save();
  ctx.clip();
  ctx.drawImage(img, photoX + innerPad, photoY + innerPad, photoSize - innerPad * 2, photoSize - innerPad * 2);
  ctx.restore();

  // Body text
  const bodyStartY = photoY + photoSize + 68;
  ctx.fillStyle = '#eef5ff';
  ctx.font = '800 66px Inter, Arial, sans-serif';
  ctx.fillText(values.name, 56, bodyStartY);

  ctx.fillStyle = '#d8e5f7';
  ctx.font = '500 44px Inter, Arial, sans-serif';
  ctx.fillText(values.category, 56, bodyStartY + 78);
  ctx.fillText(values.org, 56, bodyStartY + 140);

  // Footer separator
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, bodyStartY + 234);
  ctx.lineTo(width - 56, bodyStartY + 234);
  ctx.stroke();

  // Tag chip
  const chipY = bodyStartY + 262;
  ctx.fillStyle = '#0d3b69';
  ctx.font = '800 42px Inter, Arial, sans-serif';
  const tagText = values.tag || 'TAG-XXXX';
  const tagTextWidth = ctx.measureText(tagText).width;
  const chipW = Math.max(320, tagTextWidth + 56);
  drawRoundedRect(ctx, 56, chipY, chipW, 70, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#0d3b69';
  ctx.fillText(tagText, 82, chipY + 48);

  // Footer details
  ctx.fillStyle = '#e8f1fe';
  ctx.font = '600 42px Inter, Arial, sans-serif';
  ctx.fillText('Date: Apr 16-17, 2026 | Exhibition: Jun 3, 2026', 56, chipY + 108);
  ctx.fillText('Venue: GIMPA Campus', 56, chipY + 166);

  return canvas.toDataURL('image/png');
}

async function printTagCard(values){
  const snapshot = await buildTagSnapshot(values);
  if(!snapshot) return false;

  const popup = window.open('', '_blank', 'width=900,height=1000');
  if(!popup) return false;

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(values.tag)} - Print Tag</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, Arial, sans-serif;
        background: #fff;
        color: #10243b;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 10mm;
      }
      .tag-image {
        width: 86mm;
        height: auto;
        display: block;
        border-radius: 6mm;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <img class="tag-image" src="${snapshot}" alt="Printable participant tag" />
    </div>
    <script>
      window.addEventListener('load', function(){
        setTimeout(function(){ window.print(); }, 150);
      });
    <\/script>
  </body>
  </html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return true;
}

function onReady(){
  const regForm = document.getElementById('reg-form');
  const btnGen = document.getElementById('btn-generate');
  const tStatus = document.getElementById('ticket-status');
  const tCard = document.getElementById('ticket-card');
  const tId = document.getElementById('ticket-id');
  const tName = document.getElementById('ticket-name');
  const tTrack = document.getElementById('ticket-track');
  const tOrg = document.getElementById('ticket-org');
  const tPhoto = document.getElementById('ticket-photo');
  const btnDownload = document.getElementById('btn-download');
  const goSubmissionLink = document.getElementById('go-submission-link');
  const submissionSection = document.getElementById('submission');
  const submissionDescription = document.getElementById('submission-description');

  const subForm = document.getElementById('sub-form');
  const btnSubmit = document.getElementById('btn-submit');
  const subStatus = document.getElementById('sub-status');
  const subPreview = document.getElementById('submission-preview');
  const submissionSuccess = document.getElementById('submission-success');
  const submissionSuccessMeta = document.getElementById('submission-success-meta');
  const btnViewSubmissionState = document.getElementById('btn-view-submission-state');
  const btnEditSubmissionState = document.getElementById('btn-edit-submission-state');
  const subListWrap = document.getElementById('sub-list-wrap');
  let exhibitorUnlocked = false;
  let activeSubmission = null;

  function getRegistrationByTag(tag){
    const regs = load(KEY_REG);
    return regs[tag] || null;
  }

  function isExhibitorTag(tag){
    const reg = getRegistrationByTag(tag);
    return !!reg && reg.track === 'Exhibitor';
  }

  async function isExhibitorTagRemote(tag){
    if(!tag) return false;
    try {
      const reg = await fetchRegistrationRemote(tag);
      return reg.track === 'Exhibitor';
    } catch {
      return isExhibitorTag(tag);
    }
  }

  function setSubmissionAvailability(allowed){
    if(!submissionSection) return;
    submissionSection.hidden = !allowed;
    submissionSection.style.display = allowed ? '' : 'none';
    if(goSubmissionLink){
      goSubmissionLink.hidden = !allowed;
      goSubmissionLink.style.opacity = allowed ? '1' : '0.5';
      goSubmissionLink.style.pointerEvents = allowed ? 'auto' : 'none';
      goSubmissionLink.setAttribute('aria-disabled', allowed ? 'false' : 'true');
      goSubmissionLink.title = allowed ? '' : 'Only Exhibitor registrations can access Project Submission.';
    }
    if(submissionDescription && allowed){
      submissionDescription.textContent = 'Submit your project details and project proposal.';
    }
    if(!allowed && window.location.hash === '#submission'){
      window.location.hash = '#registration';
    }
  }

  setSubmissionAvailability(false);

  if(goSubmissionLink){
    goSubmissionLink.addEventListener('click', (e) => {
      if(!exhibitorUnlocked){
        e.preventDefault();
        if(subStatus){
          subStatus.textContent = 'Project submission is only available to users registered as Exhibitor.';
        }
      }
    });
  }

  if(btnGen){
    btnGen.addEventListener('click', async () => {
      btnGen.disabled = true;
      btnGen.textContent = 'Generating Tag...';
      tStatus.textContent = 'Please wait a moment while we generate your tag and save your registration.';
      const data = new FormData(regForm);
      const name = data.get('name')?.toString().trim();
      const email = data.get('email')?.toString().trim();
      const phone = data.get('phone')?.toString().trim();
      if(!name || !email){
        tStatus.textContent = 'Name and Email are required';
        btnGen.disabled = false;
        btnGen.textContent = 'Generate Tag';
        return;
      }
      if(!phone){
        tStatus.textContent = 'Phone number is required';
        btnGen.disabled = false;
        btnGen.textContent = 'Generate Tag';
        return;
      }
      const org = data.get('org')?.toString().trim() || '';
      const track = data.get('track')?.toString() || 'Participant';
      const hackathon = data.get('hackathon')?.toString().trim() || '';
      const photoFile = data.get('photo');
      if(!hackathon){
        tStatus.textContent = 'Please choose whether you will join the hackathon.';
        btnGen.disabled = false;
        btnGen.textContent = 'Generate Tag';
        return;
      }
      if(!(photoFile instanceof File) || !photoFile.size){
        tStatus.textContent = 'Please upload a participant photo.';
        btnGen.disabled = false;
        btnGen.textContent = 'Generate Tag';
        return;
      }

      let photo = '';
      try{
        photo = await fileToDataUrl(photoFile);
      } catch {
        tStatus.textContent = 'Unable to read photo. Try another image.';
        btnGen.disabled = false;
        btnGen.textContent = 'Generate Tag';
        return;
      }

      const regs = load(KEY_REG);
      // Try local first for smoother repeated registration edits.
      const existing = Object.values(regs).find(r => r.email && r.email.toLowerCase() === email.toLowerCase());
      const candidateTag = existing?.ticket || randTag();

      let savedRemote;
      try {
        savedRemote = await saveRegistrationRemote({
          tag: candidateTag,
          name,
          email,
          phone,
          org,
          track,
          hackathon,
          photo
        });
      } catch (error) {
        tStatus.textContent = error.message || 'Failed to save registration to database.';
        btnGen.disabled = false;
        btnGen.textContent = 'Generate Tag';
        return;
      }

      const ticket = savedRemote.tag;
      regs[ticket] = {
        ticket,
        name: savedRemote.name,
        email: savedRemote.email,
        phone: savedRemote.phone,
        org: savedRemote.org || '',
        track: savedRemote.track,
        hackathon: savedRemote.hackathon || hackathon,
        photo: savedRemote.photo,
        createdAt: existing?.createdAt || new Date().toISOString()
      };
      save(KEY_REG, regs);

      tId.textContent = ticket;
      tName.textContent = name;
      tTrack.textContent = `Category: ${savedRemote.track}`;
      if(tOrg) tOrg.textContent = `Organization: ${savedRemote.org || 'N/A'}`;
      if(tPhoto){
        tPhoto.src = savedRemote.photo;
      }
      tCard.style.display = 'block';
      tStatus.textContent = 'Tag generated. Save or download below.';
      btnDownload.disabled = false;

      // Persist last-used tag in session for quick access
      sessionStorage.setItem('gimpa_tf_last_ticket', ticket);
      sessionStorage.setItem('gimpa_tf_last_tag', ticket);
      sessionStorage.setItem(SESSION_REG_COMPLETE, 'true');
      sessionStorage.setItem(SESSION_REG_TRACK, savedRemote.track || '');
      sessionStorage.setItem(SESSION_REG_HACKATHON, savedRemote.hackathon || hackathon);

      const submissionIdInput = document.querySelector('input[name="ticket"]');
      if(submissionIdInput) submissionIdInput.value = ticket;

      const canSubmitProject = savedRemote.track === 'Exhibitor';
      exhibitorUnlocked = canSubmitProject;
      setSubmissionAvailability(canSubmitProject);
      if(!canSubmitProject && subStatus){
        subStatus.textContent = 'Project submission is only available to users registered as Exhibitor.';
      }
      if(savedRemote.track === 'Exhibitor'){
        tStatus.textContent = 'Tag generated. Your Project Submission button is now active.';
        if(subStatus){
          subStatus.textContent = 'Exhibitor registration complete. Click "Go to Project Submission" when you are ready.';
        }
      }
      btnGen.disabled = false;
      btnGen.textContent = 'Generate Tag';
    });
  }

  if(btnDownload){
    btnDownload.addEventListener('click', async () => {
      const values = {
        tag: tId.textContent || 'TAG-XXXX',
        name: tName.textContent || 'Participant',
        category: tTrack.textContent || 'Category: Participant',
        org: tOrg.textContent || 'Organization: N/A',
        photo: tPhoto?.src || ''
      };
      await printTagCard(values);
    });
  }

  function setSubmissionUiState(mode){
    if(!subForm || !submissionSuccess || !subListWrap) return;
    const showForm = mode === 'form';
    subForm.hidden = !showForm;
    subForm.style.display = showForm ? '' : 'none';
    submissionSuccess.hidden = mode !== 'success';
    submissionSuccess.style.display = mode === 'success' ? '' : 'none';
    subListWrap.hidden = mode !== 'preview';
    subListWrap.style.display = mode === 'preview' ? '' : 'none';
  }

  function populateSubmissionForm(ticket, submission){
    if(!subForm || !submission) return;
    subForm.elements.ticket.value = ticket || '';
    subForm.elements.title.value = submission.title || '';
    subForm.elements.desc.value = submission.desc || '';
    subForm.elements.demo.value = submission.demo || '';
    subForm.elements.repo.value = submission.repo || '';
    subForm.elements.stack.value = submission.stack || '';
  }

  function updateSuccessState(submission){
    if(!submissionSuccessMeta || !btnEditSubmissionState) return;
    const editable = canEditSubmission(submission);
    submissionSuccessMeta.textContent = editable
      ? 'Your submission has been saved. You can edit it within 24 hours of submission.'
      : 'Your submission has been saved. The 24-hour edit window has ended.';
    btnEditSubmissionState.disabled = !editable;
    btnEditSubmissionState.style.opacity = editable ? '1' : '0.6';
    btnEditSubmissionState.title = editable ? '' : 'Editing is only allowed within 24 hours after submission.';
  }

  function resetSubmissionUi(){
    activeSubmission = null;
    if(subForm){
      subForm.reset();
    }
    if(subStatus){
      subStatus.textContent = '';
    }
    if(subPreview){
      subPreview.textContent = 'No submission loaded.';
    }
    if(submissionSuccessMeta){
      submissionSuccessMeta.textContent = 'Your submission has been saved.';
    }
    if(btnEditSubmissionState){
      btnEditSubmissionState.disabled = false;
      btnEditSubmissionState.style.opacity = '1';
      btnEditSubmissionState.title = '';
    }
    setSubmissionUiState('form');
  }

  async function renderPreview(ticket){
    let s = null;
    try {
      s = await fetchSubmissionRemote(ticket);
      const subs = load(KEY_SUB);
      subs[ticket] = {
        title: s.title,
        desc: s.desc,
        demo: s.demo,
        repo: s.repo,
        stack: s.stack,
        proposalName: s.proposalName,
        proposalData: s.proposalData,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      };
      save(KEY_SUB, subs);
    } catch {
      const subs = load(KEY_SUB);
      s = subs[ticket];
    }

    if(!s){ subPreview.textContent = 'No submission found for this tag ID.'; return; }
    activeSubmission = s;
    subPreview.innerHTML = `
      <div style="display:grid;gap:6px">
        <div><strong>Tag ID:</strong> ${ticket}</div>
        <div><strong>Title:</strong> ${s.title}</div>
        <div><strong>Abstract:</strong><br/>${s.desc.replace(/</g,'&lt;')}</div>
        ${s.repo ? `<div><strong>Repository:</strong> <a href="${s.repo}" target="_blank" rel="noopener">${s.repo}</a></div>` : ''}
        ${s.demo ? `<div><strong>Live Demo:</strong> <a href="${s.demo}" target="_blank" rel="noopener">${s.demo}</a></div>` : ''}
        ${s.stack ? `<div><strong>Tech Stack:</strong> ${s.stack}</div>` : ''}
        ${s.proposalData ? `<div><strong>Project Proposal:</strong> <button type="button" class="btn btn-outline" id="download-proposal-btn">Download ${escapeHtml(s.proposalName || 'Proposal')}</button></div>` : ''}
        <div style="color:#6b7280;font-size:12px">Submitted: ${s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'}</div>
        <div style="color:#6b7280;font-size:12px">Updated: ${new Date(s.updatedAt).toLocaleString()}</div>
      </div>
    `;
    const downloadBtn = document.getElementById('download-proposal-btn');
    if(downloadBtn && s.proposalData){
      downloadBtn.addEventListener('click', () => triggerDownload(s.proposalName || 'project-proposal', s.proposalData));
    }
    setSubmissionUiState('preview');
  }

  resetSubmissionUi();

  if(btnSubmit){
    btnSubmit.addEventListener('click', async () => {
      const data = new FormData(subForm);
      const ticket = data.get('ticket')?.toString().trim();
      const title = data.get('title')?.toString().trim();
      const desc = data.get('desc')?.toString().trim();
      const demo = data.get('demo')?.toString().trim();
      const repo = data.get('repo')?.toString().trim();
      const stack = data.get('stack')?.toString().trim();
      const proposalFile = data.get('proposal');
      if(!ticket || !title || !desc){ subStatus.textContent = 'Tag ID, Title, and Abstract are required.'; return; }

      let proposalData = activeSubmission?.proposalData || '';
      let proposalName = activeSubmission?.proposalName || '';
      if(proposalFile instanceof File && proposalFile.size){
        const isPdf = proposalFile.type === 'application/pdf' || proposalFile.name.toLowerCase().endsWith('.pdf');
        if(!isPdf){
          subStatus.textContent = 'Project proposal must be uploaded as a PDF only.';
          return;
        }
        try{
          proposalData = await fileToDataUrl(proposalFile);
          proposalName = proposalFile.name;
        } catch {
          subStatus.textContent = 'Unable to read the project proposal file.';
          return;
        }
      }

      subStatus.textContent = 'Submitting project...';
      try {
        const savedSubmission = await saveSubmissionRemote({ tag: ticket, title, desc, demo, repo, stack, proposalName, proposalData });
        activeSubmission = savedSubmission || {
          tag: ticket,
          title,
          desc,
          demo,
          repo,
          stack,
          proposalName,
          proposalData,
          createdAt: activeSubmission?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      } catch (error) {
        subStatus.textContent = error.message || 'Failed to save submission.';
        return;
      }

      const subs = load(KEY_SUB);
      subs[ticket] = {
        title,
        desc,
        demo,
        repo,
        stack,
        proposalName: activeSubmission.proposalName,
        proposalData: activeSubmission.proposalData,
        createdAt: activeSubmission.createdAt || new Date().toISOString(),
        updatedAt: activeSubmission.updatedAt || new Date().toISOString()
      };
      save(KEY_SUB, subs);
      subStatus.textContent = '';
      updateSuccessState(activeSubmission);
      setSubmissionUiState('success');
    });
  }

  if(btnViewSubmissionState){
    btnViewSubmissionState.addEventListener('click', async () => {
      const ticket = subForm?.elements.ticket.value?.trim();
      if(ticket) await renderPreview(ticket);
    });
  }

  if(btnEditSubmissionState){
    btnEditSubmissionState.addEventListener('click', () => {
      if(!activeSubmission || !canEditSubmission(activeSubmission)) return;
      populateSubmissionForm(subForm?.elements.ticket.value?.trim(), activeSubmission);
      setSubmissionUiState('form');
      subStatus.textContent = 'You can edit this submission until 24 hours after the original submission time.';
    });
  }

  // Auto-fill tag ID from session if present
  const registrationComplete = sessionStorage.getItem(SESSION_REG_COMPLETE) === 'true';
  const registrationTrack = sessionStorage.getItem(SESSION_REG_TRACK) || '';
  const last = sessionStorage.getItem('gimpa_tf_last_tag') || sessionStorage.getItem('gimpa_tf_last_ticket');
  if(last && registrationComplete && registrationTrack === 'Exhibitor'){
    const t = document.querySelector('input[name="ticket"]');
    if(t) t.value = last;
    isExhibitorTagRemote(last).then(async (allowed) => {
      exhibitorUnlocked = allowed;
      setSubmissionAvailability(allowed);
      if(!allowed) return;
      resetSubmissionUi();
      if(subForm?.elements.ticket){
        subForm.elements.ticket.value = last;
      }
    });
  } else {
    exhibitorUnlocked = false;
    setSubmissionAvailability(false);
  }
}

document.addEventListener('DOMContentLoaded', onReady);
