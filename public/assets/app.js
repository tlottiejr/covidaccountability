// Tiny helper
const $ = (s, r=document) => r.querySelector(s);

async function injectPartials() {
  const head = $('#site-header'), foot = $('#site-footer');
  if (head) head.innerHTML = await fetch('/partials/header.html',{cache:'no-store'}).then(r=>r.text()).catch(()=>head.innerHTML);
  if (foot) foot.innerHTML = await fetch('/partials/footer.html',{cache:'no-store'}).then(r=>r.text()).catch(()=>foot.innerHTML);
}

async function fetchStates() {
  const tries = ['/api/states','/api/states/','/assets/states.json'];
  for (const url of tries) {
    try {
      const r = await fetch(url, { headers:{accept:'application/json'}, cache:'no-store' });
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) && data.length) return data;
    } catch {}
  }
  return [];
}

async function populateStates() {
  const sel = $('#stateSelect');
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading states…</option>`;

  const states = await fetchStates();

  if (!states.length) {
    sel.innerHTML = `<option value="">Failed to load states (check /api/states)</option>`;
    return;
  }

  sel.innerHTML = `<option value="">Select your state…</option>`;
  for (const s of states) {
    const opt = document.createElement('option');
    opt.value = (s.code || '').toUpperCase();
    opt.textContent = (s.name || s.code || 'Unknown') + (s.unavailable ? ' — temporarily unavailable' : '');
    if (s.unavailable) opt.disabled = true;
    if (s.link) opt.dataset.link = s.link;
    sel.appendChild(opt);
  }
  console.info(`[portal] states loaded: ${sel.options.length - 1}`);
}

function toast(msg, ms=2000){
  let t = $('.toast');
  if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), ms);
}

async function verifyTurnstile(timeoutMs=12000) {
  const status = $('#verifyStatus');
  if (!window.turnstile || typeof window.turnstile.getResponse !== 'function') {
    status.textContent = 'Verification script not loaded.';
    return false;
  }
  const token = window.turnstile.getResponse();
  if (!token) { status.textContent = 'Please complete verification.'; return false; }

  status.textContent = 'Verifying…';
  const ctrl = new AbortController();
  const to = setTimeout(()=>ctrl.abort(), timeoutMs);

  try {
    const res = await fetch('/api/verify-turnstile', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ token }),
      signal: ctrl.signal
    });
    clearTimeout(to);
    const j = await res.json().catch(()=>({success:false}));
    status.textContent = j.success ? 'Success!' : 'Verification failed.';
    return !!j.success;
  } catch {
    clearTimeout(to);
    status.textContent = 'Network error.';
    return false;
  }
}

function initPortal() {
  const form = $('#reportForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const sel = $('#stateSelect');
    const opt = sel?.selectedOptions?.[0];
    if (!opt || !opt.value) { toast('Choose your state.'); return; }

    const ok = await verifyTurnstile();
    if (!ok) { toast('Verification failed.'); return; }

    // Open official link
    const url = opt.dataset.link || '';
    if (url) window.open(url, '_blank', 'noopener');

    // Optional UX
    const saveLocal = $('#optDownload')?.checked;
    const copyText  = $('#optCopy')?.checked;

    const payload = {
      state_code: sel.value,
      state_free_text: sel.value,
      name: $('#name')?.value?.trim() || '',
      email: $('#email')?.value?.trim() || '',
      details: $('#details')?.value?.trim() || '',
      created_at: new Date().toISOString()
    };

    if (saveLocal) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report-${payload.state_code}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Saved local copy.');
    }

    if (copyText) {
      const text = `State: ${payload.state_code}\nName: ${payload.name}\nEmail: ${payload.email}\nDetails:\n${payload.details}`;
      await navigator.clipboard.writeText(text).catch(()=>{});
      toast('Copied to clipboard.');
    }

    toast('Opened official board link.');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await injectPartials();
  await populateStates();
  initPortal();
});


