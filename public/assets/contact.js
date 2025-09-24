// public/assets/contact.js
// CSP-friendly contact modal (no inline styles). Auto-loads contact.css.
// Opens via any element with [data-contact-open] attribute.
// Accessible: focus trap, ESC, overlay click, restores focus on close.

(function () {
  const CSS_HREF = "/assets/contact.css";
  const CSS_ID = "contact-modal-css";
  let modalRoot = null;
  let lastActive = null;
  let isOpen = false;

  function ensureStylesheet() {
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement("link");
      link.id = CSS_ID;
      link.rel = "stylesheet";
      link.href = CSS_HREF;
      document.head.appendChild(link);
    }
  }

  function qs(root, sel) {
    return (root || document).querySelector(sel);
  }
  function qsa(root, sel) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function buildModal() {
    if (modalRoot) return modalRoot;

    // Overlay
    const overlay = document.createElement("div");
    overlay.className = "contact-overlay";
    overlay.setAttribute("aria-hidden", "true");

    // Dialog container
    const dialog = document.createElement("div");
    dialog.className = "contact-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-hidden", "true");

    // Panel
    const panel = document.createElement("div");
    panel.className = "contact-panel";

    // Header
    const header = document.createElement("div");
    header.className = "contact-header";

    const title = document.createElement("h2");
    title.className = "contact-title";
    title.id = "contact-title";
    title.textContent = "Contact Us";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "contact-close";
    closeBtn.setAttribute("aria-label", "Dismiss contact dialog");
    closeBtn.textContent = "Close";

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement("div");
    body.className = "contact-body";
    body.id = "contact-desc";

    // Try to find an existing mailto link on the page to reuse target
    const mailto = qs(document, 'a[href^="mailto:"]');
    const emailHref = mailto ? mailto.getAttribute("href") : null;

    body.innerHTML = `
      <p>Don’t hesitate to reach out regarding any questions or issues.</p>
      ${emailHref ? `<p>You can email us directly at <a href="${emailHref}">${emailHref.replace('mailto:', '')}</a>.</p>` : `<p>You can also use the “Email Us” button below.</p>`}
    `;

    // Actions
    const actions = document.createElement("div");
    actions.className = "contact-actions";

    const primary = document.createElement("a");
    primary.className = "contact-btn";
    primary.textContent = "Email Us";
    primary.href = emailHref || "/contact.html";
    primary.rel = "noopener";

    const secondary = document.createElement("button");
    secondary.type = "button";
    secondary.className = "contact-btn secondary";
    secondary.textContent = "Close";

    actions.appendChild(primary);
    actions.appendChild(secondary);

    // Assemble
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(actions);
    dialog.appendChild(panel);

    // Root
    modalRoot = document.createDocumentFragment();
    modalRoot.appendChild(overlay);
    modalRoot.appendChild(dialog);

    // Mount
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // Events
    function closeOnOverlay(e) {
      if (e.target === overlay) close();
    }
    function esc(e) {
      if (e.key === "Escape") close();
    }
    function trapFocus(e) {
      if (!isOpen) return;
      const focusables = qsa(
        panel,
        'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input,select,textarea'
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }

    overlay.addEventListener("click", closeOnOverlay);
    document.addEventListener("keydown", esc);
    document.addEventListener("keydown", trapFocus);

    closeBtn.addEventListener("click", close);
    secondary.addEventListener("click", close);

    // ARIA wiring
    dialog.setAttribute("aria-labelledby", title.id);
    dialog.setAttribute("aria-describedby", body.id);

    return modalRoot;
  }

  function open() {
    ensureStylesheet();
    buildModal();
    const overlay = qs(document, ".contact-overlay");
    const dialog = qs(document, ".contact-dialog");
    if (!overlay || !dialog) return;

    lastActive = document.activeElement;
    document.body.classList.add("body--contact-open");
    overlay.setAttribute("aria-hidden", "false");
    dialog.setAttribute("aria-hidden", "false");
    isOpen = true;

    // Focus first meaningful control
    const firstAction = qs(dialog, ".contact-btn") || qs(dialog, ".contact-close");
    if (firstAction) firstAction.focus();
  }

  function close() {
    const overlay = qs(document, ".contact-overlay");
    const dialog = qs(document, ".contact-dialog");
    if (!overlay || !dialog) return;

    overlay.setAttribute("aria-hidden", "true");
    dialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("body--contact-open");
    isOpen = false;

    if (lastActive && typeof lastActive.focus === "function") {
      lastActive.focus();
      lastActive = null;
    }
  }

  function wireTriggers(root) {
    qsa(root || document, "[data-contact-open]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        open();
      });
    });
  }

  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      queueMicrotask(fn);
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  onReady(() => {
    ensureStylesheet();
    wireTriggers(document);
  });

  // If navigation replaces parts of the DOM (client-side nav), rewire later.
  setTimeout(() => wireTriggers(document), 1000);
})();
