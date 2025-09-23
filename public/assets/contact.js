// public/assets/contact.js
// Contact Us modal. Opens when any element with [data-open-contact] is clicked.

(() => {
  const CONTACT_EMAIL = 'contact@covidaccountability.org'; // TODO: replace with your address
  const GITHUB_URL = 'https://github.com/your-org-or-user/your-repo/issues'; // optional

  function ensureModal() {
    if (document.getElementById('contact-modal')) return;

    const wrap = document.createElement('div');
    wrap.id = 'contact-modal';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `
      <div class="cu-backdrop" data-close-contact></div>
      <div class="cu-dialog" role="dialog" aria-modal="true" aria-labelledby="cu-title">
        <button class="cu-close" type="button" data-close-contact aria-label="Close">×</button>
        <h2 id="cu-title">Contact Us</h2>
        <p class="cu-text">Don't hesitate to reach out regarding any questions/issues.</p>
        <div class="cu-actions">
          <a class="btn-primary" href="mailto:${CONTACT_EMAIL}" rel="noopener">Email Us</a>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const style = document.createElement('style');
    style.textContent = `
      #contact-modal { position: fixed; inset: 0; display: none; z-index: 10000; }
      #contact-modal[aria-hidden="false"] { display: block; }
      .cu-backdrop { position:absolute; inset:0; background: rgba(9,30,66,.45); }
      .cu-dialog { position:relative; margin:6vh auto 0; max-width:520px; background:#fff;
        border-radius:14px; padding:20px 22px 18px; box-shadow:0 10px 40px rgba(17,29,74,.25);
        border:1px solid #e7eefc; }
      .cu-close { position:absolute; top:10px; right:12px; font-size:22px; background:transparent; border:0; cursor:pointer; color:#334eaa; }
      .cu-text { color:#334155; }
      .cu-actions { display:flex; gap:10px; margin:12px 0 6px; flex-wrap:wrap; }
      .btn-primary, .btn-secondary { display:inline-block; padding:10px 14px; border-radius:10px; text-decoration:none; border:1px solid #c7d7ff; }
      .btn-primary { background:#0b5cff; color:#fff; border-color:#0b5cff; }
      .btn-primary:hover { filter:brightness(.95); }
      .btn-secondary { background:#fff; color:#0b5cff; }
      .btn-secondary:hover { background:#f3f7ff; }
      .cu-note { font-size:12px; color:#64748b; }
      @media (max-width:560px){ .cu-dialog{ margin:10vh 12px 0; } }
    `;
    document.head.appendChild(style);

    const close = () => { wrap.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
    const open  = () => { wrap.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; };

    wrap.addEventListener('click', (e) => {
      if (e.target.matches('[data-close-contact], .cu-backdrop, .cu-close')) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    window.__contactModal = { open, close };
  }

  function wire() {
    ensureModal();
    document.querySelectorAll('[data-open-contact]').forEach((el) => {
      if (el.__wiredContact) return;
      el.__wiredContact = true;
      el.addEventListener('click', (e) => { e.preventDefault(); window.__contactModal.open(); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
  new MutationObserver(wire).observe(document.documentElement, { childList: true, subtree: true });
})();
