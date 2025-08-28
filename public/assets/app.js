/* ===== Tiny helpers ===== */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
function toast(msg, ms=2000){
  let t = $('.toast'); if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h);
  t._h = setTimeout(()=>t.classList.remove('show'), ms);
}

/* ===== Nav active state ===== */
(function highlightNav(){
  const path = location.pathname.replace(/\/+$/,'') || '/';
  $$('.nav a').forEach(a=>{
    const href = a.getAttribute('href');
    if ((path === '/' && href === '/') || (href && href !== '/' && path.endsWith(href))) {
      a.classList.add('active');
    }
  });
})();

/* ===== State dropdown (complaint portal) ===== */
const STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado',
  CT:'Connecticut', DE:'Delaware', DC:'District of Columbia', FL:'Florida', GA:'Georgia',
  HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas',
  KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts',
  MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana',
  NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico',
  NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota',
  TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington',
  WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming'
};

async function safeJsonFetch(url){
  const r = await fetch(url, {headers:{accept:'application/json'}, cache:'no-store'});
  const txt = await r.text();
  try{
    return JSON.parse(txt);
  }catch{
    // last resort: attempt array eval (rare)
    if (/^\s*\[/.test(txt)) try{ return Function(`return (${txt})`)(); }catch(e){}
    return null;
  }
}

async function loadStates(){
  const sel = $('#state'); if (!sel) return;

  sel.innerHTML = `<option value="">Loading states…</option>`;

  // 1) Try API (D1). 2) Fallback to static JSON.
  let data = await safeJsonFetch('/api/states').catch(()=>null);
  if (!Array.isArray(data) || data.length === 0){
    data = await safeJsonFetch('/assets/states.json').catch(()=>null);
  }
  if (!Array.isArray(data) || data.length === 0){
    sel.innerHTML = `<option value="">Failed to load states</option>`;
    return;
  }

  // Normalize shape
  const states = data.map(s => ({
    code: (s.code || s.abbr || s.state || '').toUpperCase(),
    name: s.name || s.label || STATE_NAMES[(s.code||'').toUpperCase()] || (s.code||''),
    link: s.link || s.url || s.href || '',
    unavailable: !!(s.unavailable || s.down || s.disabled)
  })).sort((a,b)=> a.name.localeCompare(b.name));

  // Populate dropdown
  sel.innerHTML = `<option value="">Select your state…</option>`;
  for (const s of states){
    const o = document.createElement('option');
    o.value = s.code;
    o.textContent = s.name + (s.unavailable ? ' — temporarily unavailable' : '');
    if (s.unavailable) o.disabled = true;
    o.dataset.link = s.link || '';
    sel.appendChild(o);
  }

  // Keep ref for board panel
  sel._states = states;
  sel.addEventListener('change', updateBoardPanel);
}

function updateBoardPanel(){
  const sel = $('#state'); const box = $('#boardPanel'); if (!sel || !box) return;
  const o = sel.selectedOptions[0]; if (!o) return;
  const code = o.value;
  const data = (sel._states || []).find(s=>s.code===code);
  const url = data?.link || '';
  let host = '—';
  try{ if(url) host = new URL(url).host; }catch{}
  const verified = data?.verified_at ? new Date(data.verified_at).toLocaleString() : '—';
  const status = data?.unavailable ? 'unavailable' : (url ? 'ok' : 'pending');

  $('#boardName').textContent = STATE_NAMES[code] ? `${STATE_NAMES[code]} Board` : '—';
  $('#boardUrl').textContent = url || 'Not available yet';
  $('#boardUrl').href = url || '#';
  $('#boardHost').textContent = url ? host : '—';
  $('#boardStatus').textContent = status;
  $('#openBoardBtn').disabled = !url;
}

async function verifyTurnstile() {
  const status = $('#turnstileStatus');
  if (!window.turnstile || typeof window.turnstile.getResponse !== 'function'){
    status.textContent = 'Verification script not loaded.';
    return { success:false };
  }
  const token = window.turnstile.getResponse();
  if (!token){ status.textContent = 'Please complete the verification.'; return { success:false }; }
  status.textContent = 'Verifying…';

  try{
    const r = await fetch('/api/verify-turnstile', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ token })
    });
    const j = await r.json();
    status.textContent = j.success ? 'Success!' : 'Verification failed.';
    return j;
  }catch(e){
    status.textContent = 'Network error verifying.';
    return { success:false };
  }
}

function initPortal(){
  const form = $('#reportForm'); if (!form) return;
  loadStates();

  $('#openBoardBtn')?.addEventListener('click', (e)=>{
    e.preventDefault();
    const sel = $('#state'); const o = sel?.selectedOptions?.[0];
    const url = o?.dataset?.link || '';
    if (!url){ toast('No official link for this state yet.'); return; }
    window.open(url,'_blank','noopener');
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const sel = $('#state');
    if (!sel?.value){ toast('Choose your state first.'); return; }

    const v = await verifyTurnstile();
    if (!v.success){ toast('Verification failed.'); return; }

    // open board page
    const url = sel.selectedOptions[0]?.dataset?.link || '';
    if (url) window.open(url,'_blank','noopener');

    // optional local copy
    if ($('#optSave')?.checked){
      const payload = {
        state: sel.value,
        name: $('#name')?.value?.trim()||'',
        email: $('#email')?.value?.trim()||'',
        details: $('#details')?.value?.trim()||'',
        ts: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report-${payload.state}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    // optional copy to clipboard
    if ($('#optCopy')?.checked){
      const text = `State: ${sel.value}
Name: ${$('#name')?.value||''}
Email: ${$('#email')?.value||''}
Details:
${$('#details')?.value||''}`;
      try{ await navigator.clipboard.writeText(text); }catch{}
    }
    toast('Opened official board page.');
  });
}

document.addEventListener('DOMContentLoaded', initPortal);
