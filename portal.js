// Simple in-browser storage keys
const KEY_REG = 'gimpa_tf_registrations_v1';
const KEY_SUB = 'gimpa_tf_submissions_v1';

function load(key){
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function save(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }

function randTicket(){
  const part = () => Math.random().toString(36).slice(2,6).toUpperCase();
  return `TKT-${part()}${part()}`;
}

function buildTicketPdf(ticket, name, email, track){
  const ascii = (text) => {
    // Keep generated PDF text ASCII-safe for broad PDF viewer compatibility.
    return (text || '')
      .replace(/[^\x20-\x7E]/g, '?')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  };

  const lines = {
    title: 'GIMPA SOTSS Tech Fair 2026',
    subtitle: 'Registration Ticket',
    ticket: ticket,
    name: name,
    email: email,
    track: track,
    footer: 'Date: May 15-17, 2026 | Venue: GIMPA Campus'
  };

  const stream = [
    // Light page background
    '0.95 0.96 0.98 rg',
    '0 0 612 792 re',
    'f',
    // Main blue ticket card
    '0.06 0.23 0.39 rg',
    '56 440 500 260 re',
    'f',
    // Badge box
    '1 1 1 rg',
    '388 636 160 44 re',
    'f',
    // Title block
    '1 1 1 rg',
    'BT',
    '/F1 22 Tf',
    '78 662 Td',
    `(${ascii(lines.title)}) Tj`,
    '0 -24 Td',
    '/F1 16 Tf',
    `(${ascii(lines.subtitle)}) Tj`,
    'ET',
    // Badge text
    '0.06 0.23 0.39 rg',
    'BT',
    '/F1 16 Tf',
    '398 652 Td',
    `(${ascii(lines.ticket)}) Tj`,
    'ET',
    // Participant details
    '1 1 1 rg',
    'BT',
    '/F1 24 Tf',
    '78 595 Td',
    `(${ascii(lines.name)}) Tj`,
    '0 -30 Td',
    '/F1 18 Tf',
    `(${ascii(lines.email)}) Tj`,
    '0 -28 Td',
    `(${ascii(lines.track)}) Tj`,
    '0 -40 Td',
    '/F1 14 Tf',
    `(${ascii(lines.footer)}) Tj`,
    'ET'
  ].join('\n');

  const enc = new TextEncoder();
  const streamBytes = enc.encode(stream);
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for(const obj of objs){
    offsets.push(enc.encode(pdf).length);
    pdf += obj;
  }

  const xrefStart = enc.encode(pdf).length;
  pdf += 'xref\n0 6\n';
  pdf += '0000000000 65535 f \n';
  for(let i = 1; i <= 5; i++){
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\n';
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  return enc.encode(pdf);
}

function onReady(){
  const regForm = document.getElementById('reg-form');
  const btnGen = document.getElementById('btn-generate');
  const tStatus = document.getElementById('ticket-status');
  const tCard = document.getElementById('ticket-card');
  const tId = document.getElementById('ticket-id');
  const tName = document.getElementById('ticket-name');
  const tEmail = document.getElementById('ticket-email');
  const tTrack = document.getElementById('ticket-track');
  const btnDownload = document.getElementById('btn-download');

  const subForm = document.getElementById('sub-form');
  const btnSubmit = document.getElementById('btn-submit');
  const btnView = document.getElementById('btn-view');
  const subStatus = document.getElementById('sub-status');
  const subPreview = document.getElementById('submission-preview');

  if(btnGen){
    btnGen.addEventListener('click', () => {
      const data = new FormData(regForm);
      const name = data.get('name')?.toString().trim();
      const email = data.get('email')?.toString().trim();
      if(!name || !email){ tStatus.textContent = 'Name and Email are required'; return; }
      const org = data.get('org')?.toString().trim() || '';
      const track = data.get('track')?.toString() || 'General';

      const regs = load(KEY_REG);
      // If user already exists by email, reuse ticket
      let ticket = Object.values(regs).find(r => r.email.toLowerCase() === email.toLowerCase())?.ticket || randTicket();
      regs[ticket] = {ticket, name, email, org, track, createdAt: new Date().toISOString()};
      save(KEY_REG, regs);

      tId.textContent = ticket;
      tName.textContent = name;
      tEmail.textContent = email;
      tTrack.textContent = `Track: ${track}`;
      tCard.style.display = 'block';
      tStatus.textContent = 'Ticket generated. Save or download below.';
      btnDownload.disabled = false;

      // Persist last-used ticket in session for quick access
      sessionStorage.setItem('gimpa_tf_last_ticket', ticket);
    });
  }

  if(btnDownload){
    btnDownload.addEventListener('click', () => {
      const ticket = tId.textContent || 'TKT-XXXX';
      const name = tName.textContent || 'Participant';
      const email = tEmail.textContent || 'N/A';
      const track = tTrack.textContent || 'Track: General';

      const pdfBytes = buildTicketPdf(ticket, name, email, track);
      const blob = new Blob([pdfBytes], {type:'application/pdf'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${ticket}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  function renderPreview(ticket){
    const subs = load(KEY_SUB);
    const s = subs[ticket];
    if(!s){ subPreview.textContent = 'No submission found for this ticket.'; return; }
    subPreview.innerHTML = `
      <div style="display:grid;gap:6px">
        <div><strong>Ticket:</strong> ${ticket}</div>
        <div><strong>Title:</strong> ${s.title}</div>
        <div><strong>Description:</strong><br/>${s.desc.replace(/</g,'&lt;')}</div>
        <div><strong>Repository:</strong> <a href="${s.repo}" target="_blank" rel="noopener">${s.repo}</a></div>
        ${s.demo ? `<div><strong>Live Demo:</strong> <a href="${s.demo}" target="_blank" rel="noopener">${s.demo}</a></div>` : ''}
        ${s.stack ? `<div><strong>Tech Stack:</strong> ${s.stack}</div>` : ''}
        <div style="color:#6b7280;font-size:12px">Updated: ${new Date(s.updatedAt).toLocaleString()}</div>
      </div>
    `;
  }

  if(btnSubmit){
    btnSubmit.addEventListener('click', () => {
      const data = new FormData(subForm);
      const ticket = data.get('ticket')?.toString().trim();
      const title = data.get('title')?.toString().trim();
      const desc = data.get('desc')?.toString().trim();
      const demo = data.get('demo')?.toString().trim();
      const repo = data.get('repo')?.toString().trim();
      const stack = data.get('stack')?.toString().trim();
      if(!ticket || !title || !desc || !repo){ subStatus.textContent = 'Ticket, Title, Description and Repository are required.'; return; }

      const regs = load(KEY_REG);
      if(!regs[ticket]){ subStatus.textContent = 'Ticket not found. Please register first or check your Ticket ID.'; return; }

      const subs = load(KEY_SUB);
      subs[ticket] = {title, desc, demo, repo, stack, updatedAt: new Date().toISOString()};
      save(KEY_SUB, subs);
      subStatus.textContent = 'Submission saved.';
      renderPreview(ticket);
    });
  }

  if(btnView){
    btnView.addEventListener('click', () => {
      const data = new FormData(subForm);
      const ticket = data.get('ticket')?.toString().trim();
      if(!ticket){ subStatus.textContent = 'Enter Ticket ID to view'; return; }
      renderPreview(ticket);
    });
  }

  // Auto-fill ticket from session if present
  const last = sessionStorage.getItem('gimpa_tf_last_ticket');
  if(last){
    const t = document.querySelector('input[name="ticket"]');
    if(t) t.value = last;
  }
}

document.addEventListener('DOMContentLoaded', onReady);
