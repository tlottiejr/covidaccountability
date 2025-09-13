// Complaint Portal logic with accessibility improvements
const jsonUrl = '/assets/state-links.json';
const stateSelect = document.getElementById('stateSelect');
const boardsEl    = document.getElementById('boards');
const openBtn     = document.getElementById('openBtn');
const srStatus    = document.getElementById('sr-status');

let STATE_LINKS = [];
let selected = { state: null, link: null };

// --- utilities ---------------------------------------------------------------
const say = (msg) => { if (srStatus) srStatus.textContent = msg; };
const esc = (s='') => s.toString()
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const hostOf = (url) => { try { return new URL(url).host; } catch { return ''; } };
const byName = (a,b) => a.name.localeCompare(b.name);

// --- fetch data --------------------------------------------------------------
async function loadStateLinks() {
  const res = await fetch(jsonUrl + '?v=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load state links');
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Invalid state-links.json shape');
  STATE_LINKS = data.slice().sort(byName);
}

// --- renderers ---------------------------------------------------------------
function renderStateOptions() {
  for (const s of STATE_LINKS) {
    const opt = document.createElement('option');
    opt.value = s.code;
    opt.textContent = s.name;
    stateSelect.appendChild(opt);
  }
}

function renderBoardsFor(code) {
  boardsEl.innerHTML = '';
  const st = STATE_LINKS.find(s => s.code === code);
  selected.state = st || null;
  selected.link = null;

  if (!st || !Array.isArray(st.links) || st.links.length === 0) {
    const p = document.createElement('p');
    p.className = 'small';
    p.textContent = 'No boards available for this state.';
    boardsEl.appendChild(p);
    disableOpen();
    return;
  }

  // Radio list
  st.links.forEach((link, idx) => {
    const id = `board-${st.code}-${idx}`;
    const url = String(link.url || '');
    const boardName = String(link.board || 'Board');
    const host = hostOf(url);
    const unavailable = !!link.unavailable;

    const row = document.createElement('div');
    row.className = 'radio-row';

    const inp = document.createElement('input');
    inp.type = 'radio';
    inp.name = 'board';
    inp.id = id;
    inp.value = url;
    if (link.primary) inp.setAttribute('data-primary', '1');

    const lab = document.createElement('label');
    lab.htmlFor = id;
    lab.className = 'radio-label';
    lab.innerHTML = `
      <span class="radio-title">${esc(boardName)}</span>
      <span class="radio-sub">${esc(host)}</span>
      ${unavailable ? `<span class="badge badge-warn">(temporarily unavailable)</span>` : ''}
    `;

    inp.addEventListener('change', () => {
      selected.link = link;
      enableOpen();
      say(`Selected ${boardName}${host ? ' at ' + host : ''}. Open button enabled.`);
    });

    row.appendChild(inp);
    row.appendChild(lab);
    boardsEl.appendChild(row);
  });

  // Preselect primary if present
  const primary = boardsEl.querySelector('input[type=radio][data-primary="1"]');
  if (primary) {
    primary.checked = true;
    primary.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    disableOpen();
  }
}

function enableOpen() {
  openBtn.disabled = false;
  openBtn.setAttribute('aria-disabled', 'false');
}
function disableOpen() {
  openBtn.disabled = true;
  openBtn.setAttribute('aria-disabled', 'true');
}

// --- turnstile verify (non-blocking fallback) --------------------------------
async function verifyTurnstileToken() {
  const el = document.querySelector('input[name="cf-turnstile-response"]');
  const token = el?.value || (window.turnstile?.getResponse ? window.turnstile.getResponse() : '');
  if (!token) return { success: false, reason: 'no-token' };

  try {
    const res = await fetch('/api/verify-turnstile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token })
    });
    if (!res.ok) return { success: false, reason: `http-${res.status}` };
    const data = await res.json();
    return { success: !!data.success };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

// --- events ------------------------------------------------------------------
stateSelect.addEventListener('change', () => {
  const code = stateSelect.value;
  renderBoardsFor(code);
  const label = stateSelect.options[stateSelect.selectedIndex]?.text || '';
  say(`State ${label} selected.`);
});

openBtn.addEventListener('click', async () => {
  if (!selected?.link?.url) return;

  say('Verifying…');
  const verify = await verifyTurnstileToken();
  if (verify.success) say('Verification passed. Opening board site in a new tab.');
  else say('Verification unavailable. Opening board site (fallback).');

  try {
    window.open(selected.link.url, '_blank', 'noopener');
  } catch {
    location.href = selected.link.url; // popup blocked → same-tab fallback
  }
});

// --- init --------------------------------------------------------------------
(async () => {
  try {
    await loadStateLinks();
    renderStateOptions();
  } catch (e) {
    console.error(e);
    say('Could not load state links. Please try again later.');
  }
})();

