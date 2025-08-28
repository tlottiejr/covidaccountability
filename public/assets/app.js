<script>
(() => {
  const $ = s => document.querySelector(s);

  function toast(msg, ms=2200){
    let t = document.querySelector('.toast');
    if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), ms);
  }

  // Parse JSON or return null on HTML/text
  async function safeJson(res){
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      return j;
    } catch {
      // If it looks like HTML (Access, 403, 404, etc) return null
      if (/<html|<!doctype/i.test(txt)) return null;
      // Try a lenient eval of arrays (rare)
      if (/^\s*\[/.test(txt)) {
        try { return Function(`return (${txt})`)(); } catch {}
      }
      return null;
    }
  }

  // Robust state fetcher with fallbacks and console diagnostics
  async function getStatesList() {
    const tries = ['/api/states', '/api/states/', '/assets/states.json'];
    let lastErr = null;

    for (const url of tries) {
      try {
        const res = await fetch(url, { headers: { 'accept': 'application/json' }, cache: 'no-store' });
        if (!res.ok) {
          console.warn(`[states] ${url} → ${res.status}`);
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        const raw = await safeJson(res);
        if (!raw) { console.warn(`[states] ${url} → non-JSON/HTML response`); continue; }

        let arr = Array.isArray(raw) ? raw : (raw.states || raw.data || []);
        if (!Array.isArray(arr)) {
          console.warn(`[states] ${url} → JSON but not an array`); 
          continue;
        }
        // normalize fields
        const norm = arr.map(s => ({
          code: s.code || s.abbr || s.slug || s.id || s.state || '',
          label: s.label || s.name || s.state || s.code || 'Unknown',
          link:  s.link  || s.url  || s.href  || s.board_link || '',
          unavailable: !!(s.unavailable || s.disabled || s.down)
        }));
        console.info(`[states] loaded from ${url} (${norm.length} items)`);
        return norm;
      } catch (e) {
        console.warn(`[states] ${url} → error`, e);
        lastErr = e;
      }
    }
    throw (lastErr || new Error('No states JSON found.'));
  }

  async function populateStates(){
    const sel = $('#stateSelect'); const err = $('#stateError');
    if (!sel) return;

    // Prevent double-population
    if (sel.options.length > 1) return;

    // “loading…” option for clarity
    const loadingOpt = document.createElement('option');
    loadingOpt.value = ''; loadingOpt.disabled = true; loadingOpt.textContent = 'Loading states…';
    sel.appendChild(loadingOpt);

    try{
      const states = await getStatesList();
      // Clear old options
      sel.innerHTML = '<option value="">Select your state…</option>';

      if (!states.length){
        const o = document.createElement('option');
        o.value = ''; o.textContent = 'No states available (try again later)'; o.disabled = true;
        sel.appendChild(o);
        return;
      }

      for (const s of states){
        const o = document.createElement('option');
        o.value = s.code || s.link || '';
        o.textContent = s.label + (s.unavailable ? ' — temporarily unavailable' : '');
        if (s.link) o.dataset.link = s.link;
        if (s.unavailable) o.disabled = true;
        sel.appendChild(o);
      }
      err.textContent = '';
    }catch(e){
      console.error('[states] final failure', e);
      sel.innerHTML = '';
      const o = document.createElement('option');
      o.value = ''; o.textContent = 'Failed to load states (check /api/states)'; o.disabled = true;
      sel.appendChild(o);
      $('#stateError').textContent = 'Could not load the state list. Open /api/states in a new tab and check the response.';
    }
  }

  function initPortal(){
    const form = $('#reportForm'); if(!form) return;
    const sel  = $('#stateSelect'); const err = $('#stateError');
    const dl   = $('#optDownload'); const cp  = $('#optCopy');
    const stat = $('#verifyStatus');

    function valid(){
      const ok = !!sel.value;
      err.textContent = ok ? '' : 'Please choose your state board.';
      return ok;
    }
    sel?.addEventListener('change', valid);

    async function verifyTurnstile({ timeoutMs=12000 } = {}){
      if (!window.turnstile || typeof window.turnstile.getResponse !== 'function'){
        stat.textContent = 'Verification script not loaded. Check site-key & allowed domains.';
        return { success:false };
      }
      const token = window.turnstile.getResponse();
      if (!token){ stat.textContent = 'Please complete the verification.'; return { success:false }; }
      stat.textContent = 'Verifying…';

      const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort('timeout'), timeoutMs);
      try{
        const r = await fetch('/api/verify-turnstile', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ token }),
          signal: ctrl.signal
        });
        clearTimeout(to);
        const j = await r.json().catch(()=>({success:false}));
        stat.textContent = j.success ? 'Success!' : 'Verification failed.';
        return j;
      }catch(e){
        clearTimeout(to);
        stat.textContent = e==='timeout' ? 'Taking longer than usual… retrying.' : 'Network error verifying.';
        if (e==='timeout'){ return verifyTurnstile({ timeoutMs: 12000 }); }
        return { success:false };
      }
    }

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if (!valid()) return;

      const v = await verifyTurnstile();
      if (!v.success){ toast('Could not verify.'); return; }

      const opt = sel.selectedOptions[0];
      const url = opt?.dataset?.link || opt?.value;
      if (url) window.open(url,'_blank','noopener');

      if (dl?.checked){
        const payload = {
          name: $('#name')?.value?.trim()||'',
          email: $('#email')?.value?.trim()||'',
          details: $('#details')?.value?.trim()||'',
          state: sel.value, ts: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `report-${payload.state||'state'}-${Date.now()}.json`; a.click();
        URL.revokeObjectURL(a.href);
        toast('Saved local copy.');
      }

      if (cp?.checked){
        const txt = `State: ${sel.value}
Name: ${$('#name')?.value||''}
Email: ${$('#email')?.value||''}
Details:
${$('#details')?.value||''}`;
        await navigator.clipboard.writeText(txt).catch(()=>{});
        toast('Copied to clipboard.');
      }
      toast('Opened official board link.');
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    populateStates();
    initPortal();
  });
})();
</script>
