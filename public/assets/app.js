<script>
(() => {
  const $ = s => document.querySelector(s);

  // Little toast helper
  function toast(msg, ms=2200){
    let t = document.querySelector('.toast');
    if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), ms);
  }

  // Robust GET /api/states → always return an array
  async function fetchStates(){
    const res = await fetch('/api/states', { headers: { 'accept':'application/json' }, cache: 'no-store' });
    const data = await res.json().catch(()=>[]);
    let arr = Array.isArray(data) ? data : (data?.states || data?.data || []);
    if (!Array.isArray(arr)) arr = [];
    // normalize
    return arr.map(s => ({
      code: s.code || s.abbr || s.slug || s.id || s.state || '',
      label: s.label || s.name || s.state || s.code || 'Unknown',
      link:  s.link  || s.url  || s.href  || s.board_link || '',
      unavailable: !!(s.unavailable || s.disabled || s.down)
    }));
  }

  async function ensureStates(){
    const sel = $('#stateSelect'); if(!sel) return;
    if (sel.options.length > 1) return; // already filled

    try{
      const states = await fetchStates();
      states.forEach(s=>{
        const o = document.createElement('option');
        o.value = s.code || s.link || '';
        o.textContent = s.label + (s.unavailable ? ' — temporarily unavailable' : '');
        if (s.link) o.dataset.link = s.link;
        if (s.unavailable) o.disabled = true;
        sel.appendChild(o);
      });
      if (states.length === 0){
        const o = document.createElement('option');
        o.value = ''; o.textContent = 'No states available (try again later)'; o.disabled = true;
        sel.appendChild(o);
      }
    }catch{
      const o = document.createElement('option');
      o.value = ''; o.textContent = 'Failed to load states (check /api/states)'; o.disabled = true;
      sel.appendChild(o);
    }
  }

  function initPortal(){
    const form = $('#reportForm'); if(!form) return;

    const sel = $('#stateSelect'); const err = $('#stateError');
    const dl  = $('#optDownload'); const cp  = $('#optCopy');
    const stat= $('#verifyStatus');

    function valid(){
      const ok = !!sel.value;
      err.textContent = ok ? '' : 'Please choose your state board.';
      return ok;
    }
    sel?.addEventListener('change', valid);

    async function verifyTurnstile({ timeoutMs = 12000 } = {}){
      // If the widget never rendered, tell the user clearly
      if (!window.turnstile || typeof window.turnstile.getResponse !== 'function'){
        stat.textContent = 'Verification script not loaded. Check Turnstile site-key and allowed domains.';
        return { success:false };
      }
      const token = window.turnstile.getResponse();
      if (!token){
        stat.textContent = 'Please complete the verification.';
        return { success:false };
      }
      stat.textContent = 'Verifying…';

      // timeout wrapper
      const ctrl = new AbortController();
      const t = setTimeout(()=>ctrl.abort('timeout'), timeoutMs);

      try{
        const r = await fetch('/api/verify-turnstile', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ token }),
          signal: ctrl.signal
        });
        clearTimeout(t);
        const j = await r.json().catch(()=>({success:false}));
        stat.textContent = j.success ? 'Success!' : 'Verification failed.';
        return j;
      }catch(e){
        clearTimeout(t);
        stat.textContent = e === 'timeout' ? 'Taking longer than usual… retrying once.' : 'Network error verifying.';
        // one retry on timeout
        if (e === 'timeout'){
          return verifyTurnstile({ timeoutMs: 12000 });
        }
        return { success:false };
      }
    }

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if(!valid()) return;

      const v = await verifyTurnstile();
      if (!v.success) { toast('Could not verify.'); return; }

      // open official board link
      const opt = sel.selectedOptions[0];
      const url = opt?.dataset?.link || opt?.value;
      if (url) window.open(url,'_blank','noopener');

      // optional local save
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

      // optional copy to clipboard
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
    ensureStates();
    initPortal();
  });
})();
</script>
