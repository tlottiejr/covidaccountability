<script>
(() => {
  const $ = s => document.querySelector(s);

  function toast(msg, ms=2200){
    let t = $('.toast');
    if(!t){
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(()=>t.classList.remove('show'), ms);
  }

  function initPortal(){
    const form = $('#reportForm');
    if(!form) return;
    const stateSel = $('#stateSelect');
    const err = $('#stateError');
    const dl = $('#optDownload');
    const cp = $('#optCopy');

    // Inline validation
    function validate(){
      const ok = !!stateSel?.value;
      err.textContent = ok ? '' : 'Please choose your state board.';
      return ok;
    }
    stateSel?.addEventListener('change', validate);

    // Submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if(!validate()) return;

      // Turnstile check (optional — page contains widget)
      const token = window.turnstile?.getResponse?.() || '';
      if(!token){ toast('Please complete the verification.'); return; }

      // Verify with backend route
      try{
        const res = await fetch('/api/verify-turnstile',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ token })});
        const data = await res.json();
        if(!data.success){ toast('Verification failed. Try again.'); return; }
      }catch{ toast('Network error verifying.'); return; }

      // Open official board link
      const opt = stateSel.selectedOptions[0];
      const url = opt?.dataset?.link || opt?.value;
      if(url) window.open(url, '_blank', 'noopener');

      // Optional: save JSON
      if(dl?.checked){
        const payload = {
          name: $('#name')?.value?.trim() || '',
          email: $('#email')?.value?.trim() || '',
          details: $('#details')?.value?.trim() || '',
          state: stateSel.value,
          ts: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `report-${payload.state}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Saved a local copy.');
      }

      // Optional: copy text
      if(cp?.checked){
        const text =
`State: ${stateSel.value}
Name: ${$('#name')?.value || ''}
Email: ${$('#email')?.value || ''}
Details:
${$('#details')?.value || ''}`;
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard.');
      }

      toast('Opened the official board link.');
    });
  }

  document.addEventListener('DOMContentLoaded', initPortal);
})();
</script>
