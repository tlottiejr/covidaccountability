(function(){
  async function inject(id, url){
    const host = document.getElementById(id);
    if (!host) return;
    try{
      const r = await fetch(url, { cache: 'no-store' });
      host.innerHTML = await r.text();
    }catch(e){
      console.warn('shell inject failed for', url, e);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    inject('site-header', '/partials/header.html');
    inject('site-footer', '/partials/footer.html');
  });
})();
