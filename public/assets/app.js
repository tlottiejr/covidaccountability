<script>
(() => {
  const $ = s=>document.querySelector(s);

  function toast(msg, ms=2200){
    let t = document.querySelector('.toast');
    if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), ms);
  }

  async function ensureStates(){
    const sel = $('#stateSelect'); if(!sel) return;
    if(sel.options.length>1) return; // already filled
    try{
      const r = await fetch('/api/states',{headers:{'accept':'application/json'}});
      const arr = await r.json();
      arr.forEach(s=>{
        const o = document.createElement('option');
        o.value = s.code || s.name || s.slug || '';
        o.textContent = s.label || s.name || s.code;
        if(s.link) o.dataset.link = s.link;
        if(s.unavailable) {o.disabled = true; o.textContent += ' — temporarily unavailable';}
        sel.appendChild(o);
      });
    }catch{ /* silently ignore; server handles */ }
  }

  function initPortal(){
    const form = $('#reportForm'); if(!form) return;
    const sel = $('#stateSelect'); const err = $('#stateError');
    const dl = $('#optDownload'); const cp = $('#optCopy');

    function valid(){
      const ok = !!sel.value; err.textContent = ok?'':'Please choose your state board.'; return ok;
    }
    sel?.addEventListener('change', valid);

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if(!valid()) return;

      const token = window.turnstile?.getResponse?.() || '';
      if(!token){ toast('Please complete verification.'); return; }

      try{
        const vr = await fetch('/api/verify-turnstile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});
        const vj = await vr.json(); if(!vj.success){ toast('Verification failed. Try again.'); return; }
      }catch{ toast('Network error verifying.'); return; }

      const opt = sel.selectedOptions[0];
      const url = opt?.dataset?.link || opt?.value;
      if(url) window.open(url,'_blank','noopener');

      if(dl?.checked){
        const payload = {
          name: $('#name')?.value?.trim()||'', email: $('#email')?.value?.trim()||'',
          details: $('#details')?.value?.trim()||'', state: sel.value, ts: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `report-${payload.state}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
        toast('Saved local copy.');
      }
      if(cp?.checked){
        const txt = `State: ${sel.value}\nName: ${$('#name')?.value||''}\nEmail: ${$('#email')?.value||''}\nDetails:\n${$('#details')?.value||''}`;
        await navigator.clipboard.writeText(txt); toast('Copied to clipboard.');
      }
      toast('Opened official board link.');
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    ensureStates(); initPortal();
  });
})();
</script>
