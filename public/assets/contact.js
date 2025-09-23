// assets/contact.js
// Adds a simple Contact Us modal and wires up any element with [data-open-contact].
// Edit CONTACT_EMAIL below to your real address.

(() => {
  const CONTACT_EMAIL = 'contact@covidaccountability.org'; // <-- set this
  const GITHUB_URL = 'https://github.com/<your-org-or-user>/<your-repo>/issues'; // optional

  function html(strings, ...vals) {
    return strings.reduce((s, p, i) => s + p + (vals[i] ?? ''), '');
  }

  function ensureModal() {
    if (document.getElementById('contact-modal')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'contact-modal';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = html`
      <div class="cu-backdrop" data-close-contact></div>
      <div class="cu-dialog" role="dialog" aria-modal="true" aria-labelledby="cu-title">
        <button class="cu-close" type="button" aria-label="Close" data-close-contact>×</button>
        <h2 id="cu-title">Contact Us</h2>
        <p class="cu-text">
          We’d love to hear from you. Choose one of the options below:
        </p>
        <div class="cu-actions">
          <a class="btn-primary" href="mailto:${CONTACT_EMAIL}" rel="noopener">Email Us</a>
          <a class="btn-secondary" href="${GITHUB_URL}" target="_blank" rel="noopener">Open a GitHub Issue</a>
        </div>
        <p class="cu-note">No information is stored on this site by opening the contact options.</p>
      </div>
    `;
    document.body.appendChild(wrapper);

    // styles (scoped)
    const style = document.createElement('style');
    style.textContent = `
      #contact-modal { position: fixed; inset: 0; display: none; z-index: 10000; }
      #contact-modal[aria-hidden="false"] { display: block; }
      .cu-backdrop { position: absolute; inset: 0; background: rgba(9,30,66,.5); }
      .cu-dialog {
        position: relative; margin: 6vh auto 0; max-width: 520px;
        background: #fff; border-radius: 14px; padding: 20px 22px 18px;
        box-shadow: 0 10px 40px rgba(17,29,74,.25);
        border: 1px solid #e7eefc;
      }
      .cu-close { position: absolute; top: 10px; right: 12px; font-size: 22px;
        background: transparent; border: 0; cursor: pointer; color: #334eaa; }
      .cu-text { color:#334155; }
      .cu-actions { display:flex; gap:10px; margin: 12px 0 6px; flex-wrap: wrap; }
      .btn-primary, .btn-secondary {
        display:inline-block; padding:10px 14px; border-radius:10px; text-decoration:none;
        border:1px solid #c7d7ff;
      }
      .btn-primary { background:#0b5cff; color:#fff; border-color:#0b5cff; }
      .btn-primary:hover { filter: brightness(0.95); }
      .btn-secondary { background:#fff; color:#0b5cff; }
      .btn-secondary:hover { background:#f3f7ff; }
      .cu-note { font-size:12px; color:#64748b; }
      @media (max-width: 560px) { .cu-dialog { margin: 10vh 12px 0; } }
    `;
    document.head.appendChild(style);

    // wire close
    wrapper.addEventListener('click', (e) => {
      if (e.target.matches('[data-close-contact], .cu-backdrop, .cu-close')) {
        close();
      }
    });

    function open() {
      wrapper.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      wrapper.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    // expose
    window.__contactModal = { open, close };
  }

  function wireOpeners() {
    document.querySelectorAll('[data-open-contact]').forEach((el) => {
      if (el.__wiredContact) return;
      el.__wiredContact = true;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        ensureModal();
        window.__contactModal.open();
      });
    });
  }

  // init
  document.addEventListener('DOMContentLoaded', wireOpeners);
  // For dynamically added links (unlikely here, but cheap):
  const mo = new MutationObserver(wireOpeners);
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
