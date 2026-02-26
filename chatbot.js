const CHATBOT_SOURCES = [
  'index.html',
  'pages/about.html',
  'pages/schedule.html',
  'pages/speakers.html',
  'pages/downloads.html',
  'pages/awards-judging.html',
  'pages/sponsorship-benefits.html',
  'pages/exhibitor-overview.html',
  'pages/portal.html'
];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'with', 'that', 'this', 'are', 'was', 'were', 'have', 'has', 'had',
  'from', 'into', 'about', 'what', 'when', 'where', 'which', 'will', 'can', 'how', 'who', 'why', 'a', 'an',
  'to', 'in', 'on', 'of', 'at', 'is', 'it', 'be', 'or', 'as', 'i', 'we', 'they', 'them', 'our'
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function normalizeSpace(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function escHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getContactFallback() {
  return {
    text: "I couldn't find a confident answer from the website content. Please use the Home page Contact Us section for phone numbers and email.",
    actions: [{ label: 'Open Contact Us', type: 'contact' }]
  };
}

function withMoreInfo(text, label, href) {
  return {
    text: `${text}\n\nYou can find more information on this page:`,
    links: [{ label, href }]
  };
}

function intentAnswer(query) {
  const q = query.toLowerCase();
  if (/(first place|first prize|1st prize|award for first|winner prize)/.test(q)) {
    return withMoreInfo(
      "The 1st prize is full sponsorship for any Master's programme, a cash prize, and a 3-month industry mentorship.",
      'Awards & Judging',
      'pages/awards-judging.html'
    );
  }
  if (/(date|when|what day|event date)/.test(q)) {
    return withMoreInfo(
      'The Tech Fair runs from May 15 to May 17, 2026.',
      'Event Schedule',
      'pages/schedule.html'
    );
  }
  if (/(venue|location|where is|where will|where can)/.test(q)) {
    return withMoreInfo(
      'The venue is GIMPA Campus.',
      'Home Page',
      'index.html'
    );
  }
  if (/(register|registration|tag id|tag|portal|submit project|submission)/.test(q)) {
    return withMoreInfo(
      'You can register and get your Tag ID through the Participant Portal.',
      'Registration Portal',
      'pages/portal.html'
    );
  }
  if (/(schedule|time table|agenda|date|day 1|day 2|day 3)/.test(q)) {
    return withMoreInfo(
      'The event has a 3-day schedule with keynotes, workshops, and networking sessions.',
      'Event Schedule',
      'pages/schedule.html'
    );
  }
  if (/(speaker|speakers|talk|session lead)/.test(q)) {
    return withMoreInfo(
      'The event features multiple industry speakers, including sessions on digital transformation, blockchain, and UX.',
      'Speakers',
      'pages/speakers.html'
    );
  }
  if (/(download|lecture|fact sheet|proceedings|resource|notes)/.test(q)) {
    return withMoreInfo(
      'Lecture notes, fact sheets, and program proceedings can be downloaded from the Downloads section.',
      'Downloads',
      'pages/downloads.html'
    );
  }
  if (/(award|judging|prize)/.test(q)) {
    return withMoreInfo(
      "Awards include sponsorship opportunities, cash prizes, and mentorship, with judging based on innovation, impact, feasibility, scalability, and industry relevance.",
      'Awards & Judging',
      'pages/awards-judging.html'
    );
  }
  if (/(contact|email|phone|call|help person|human)/.test(q)) {
    return getContactFallback();
  }
  return null;
}

async function buildKnowledge() {
  const chunks = [];
  for (const source of CHATBOT_SOURCES) {
    try {
      const res = await fetch(source);
      if (!res.ok) continue;
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const title = normalizeSpace(doc.title || source);
      const nodes = doc.querySelectorAll('main h1, main h2, main h3, main p, main li');
      nodes.forEach((node) => {
        const text = normalizeSpace(node.textContent || '');
        if (text.length >= 40) {
          chunks.push({ text, source, title });
        }
      });
    } catch {
      // Ignore missing pages.
    }
  }
  return chunks;
}

function retrieveAnswer(query, chunks) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || chunks.length === 0) return null;

  const scored = chunks
    .map((chunk) => {
      const lower = chunk.text.toLowerCase();
      let score = 0;
      queryTokens.forEach((token) => {
        if (lower.includes(token)) score += 1;
      });
      return { ...chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score < 2) return null;

  const top = scored.slice(0, 2);
  const lines = top.map((item) => item.text);
  return {
    text: `${lines[0]}\n\nYou can find more information on this page:`,
    links: [{ label: top[0].title, href: top[0].source }]
  };
}

function createWidget() {
  const fab = document.createElement('button');
  fab.className = 'chatbot-fab';
  fab.type = 'button';
  fab.title = 'Open chatbot';
  fab.setAttribute('aria-label', 'Open chatbot');
  fab.textContent = '💬';

  const panel = document.createElement('section');
  panel.className = 'chatbot-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="chatbot-head">
      <div class="chatbot-title">Ask Tech Fair Assistant</div>
      <button type="button" class="chatbot-close" aria-label="Close chatbot">&times;</button>
    </div>
    <div class="chatbot-body" id="chatbot-body"></div>
    <form class="chatbot-form" id="chatbot-form">
      <input class="chatbot-input" id="chatbot-input" type="text" placeholder="Ask a question..." />
      <button class="chatbot-send" type="submit">Send</button>
    </form>
  `;

  document.body.appendChild(panel);
  document.body.appendChild(fab);
  return { fab, panel };
}

function addMessage(body, content, type = 'bot') {
  const node = document.createElement('div');
  node.className = `chatbot-msg ${type}`;

  let html = escHtml(content.text || '');
  if (content.links && content.links.length) {
    const linksHtml = content.links
      .map((link) => `<a href="${escHtml(link.href)}">${escHtml(link.label)}</a>`)
      .join(' | ');
    html += `\n\n${linksHtml}`;
  }
  node.innerHTML = html.replace(/\n/g, '<br/>');

  if (content.actions && content.actions.length) {
    const actions = document.createElement('div');
    actions.className = 'chatbot-actions';
    content.actions.forEach((action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chatbot-action-btn';
      btn.textContent = action.label;
      if (action.type === 'contact') {
        btn.addEventListener('click', () => {
          const contactBtn = document.getElementById('contact-toggle');
          const panelEl = document.getElementById('organizer-contact');
          if (contactBtn && panelEl) {
            if (panelEl.style.display !== 'block') contactBtn.click();
            panelEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }
      actions.appendChild(btn);
    });
    node.appendChild(actions);
  }

  body.appendChild(node);
  body.scrollTop = body.scrollHeight;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.location.pathname.endsWith('/index.html') && window.location.pathname !== '/' && window.location.pathname !== '') {
    return;
  }

  const { fab, panel } = createWidget();
  const closeBtn = panel.querySelector('.chatbot-close');
  const form = panel.querySelector('#chatbot-form');
  const input = panel.querySelector('#chatbot-input');
  const body = panel.querySelector('#chatbot-body');
  const chunks = await buildKnowledge();

  addMessage(body, {
    text: 'Hi, I can answer questions based on the Tech Fair website. Ask me about registration, schedule, speakers, awards, or downloads.'
  });

  fab.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) input.focus();
  });

  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = normalizeSpace(input.value || '');
    if (!query) return;

    addMessage(body, { text: query }, 'user');
    input.value = '';

    const intent = intentAnswer(query);
    if (intent) {
      addMessage(body, intent, 'bot');
      return;
    }

    const retrieved = retrieveAnswer(query, chunks);
    if (retrieved) {
      addMessage(body, retrieved, 'bot');
      return;
    }

    addMessage(body, getContactFallback(), 'bot');
  });
});
