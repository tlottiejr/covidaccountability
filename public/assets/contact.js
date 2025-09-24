// public/assets/contact.js
// CSP-friendly contact modal (no inline styles). Auto-loads contact.css.
// Opens when clicking:
//   1) any element with [data-contact-open], OR
//   2) any <a> that looks like a Contact link (href/text contains "contact").
//
// Fixes:
// - Email button inside the modal is NOT intercepted by the auto-wiring.
// - Only a single Close button (in the header).
// - Overlay keeps page scroll; square corners & theme handled by CSS.

(function () {
  const CSS_HREF = "/assets/contact.css";
  const CSS_ID = "contact-modal-css";
  let modalReady = false;
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

  // Derive site link color and set --contact-link CSS var
  function syncThemeFromSite() {
    const probe = document.querySelector("a[href]") || null;
    if (!probe) return;
    try {
      const computed = getComputedStyle(probe).color;
      document.documentElement.style.setProperty("--contact-link", computed);
    } catch { /* ignore */ }
  }

  const qs = (root, sel) => (root || document).querySelector(sel);
  const qsa = (root, sel) => Array.from((root || document).querySelectorAll(sel));

  function buildOnce() {
    if (modalReady) return;
    modalReady = true;

    // Overlay (visual dim only)
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

    // Reuse existing mailto link if present
    const mailtoEl = qs(document, 'a[href^="mailto:"]');
    const emailHref = mailtoEl ? mailtoEl.getAttribute("href") : null;

    body.innerHTML = `
      <p>Don’t hesitate to reach out regarding any questions or issues.</p>
      ${emailHref
        ? `<p>You can email us directly at <a href="${emailHref}">${emailHref.replace('mailto:', '')}</a>.</p>`
        : `<p>You can also use the “Email Us” button below.</p>`}
    `;

    // Actions (single primary button)
    const actions = document.createElement("div");
    actions.className = "contact-actions";

    const primary = document.createElement("a");
    primary.className = "contact-btn";
    primary.textContent = "Email Us";
    primary.href = emailHref || "/contact.html";
    primary.rel = "noopener";
    primary.setAttribute("data-contact-ignore", ""); // <-- prevent auto-wiring interception
    actions.appendChild(primary);

    // Assemble
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(actions);
    dialog.appendChild(panel);

    // Mount
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // Events
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

    document.addEventListener("keydown", esc);
    document.addEventListener("keydown", trapFocus);

    // Close button in header
    closeBtn.addEventListener("click", close);

    // ARIA wiring
    dialog.setAttribute("aria-labelledby", title.id);
    dialog.setAttribute("aria-describedby", body.id);
  }

  function open() {
    ensureStylesheet();
    syncThemeFromSite();
    buildOnce();
    const overlay = qs(document, ".contact-overlay");
    const dialog = qs(document, ".contact-dialog");
    if (!overlay || !dialog) return;

    lastActive = document.activeElement;
    overlay.setAttribute("aria-hidden", "false");
    dialog.setAttribute("aria-hidden", "false");
    isOpen = true;

    const firstAction = qs(dialog, ".contact-btn") || qs(dialog, ".contact-close");
    if (firstAction) firstAction.focus();
  }

  function close() {
    const overlay = qs(document, ".contact-overlay");
    const dialog = qs(document, ".contact-dialog");
    if (!overlay || !dialog) return;

    overlay.setAttribute("aria-hidden", "true");
    dialog.setAttribute("aria-hidden", "true");
    isOpen = false;

    if (lastActive && typeof lastActive.focus === "function") {
      lastActive.focus();
      lastActive = null;
    }
  }

  // --- Auto-wiring ---

  function looksLikeContactLink(a) {
    if (!a || a.tagName !== "A") return false;
    if (a.hasAttribute("data-contact-ignore")) return false; // don't intercept modal's own button
    if (a.closest(".contact-dialog")) return false; // ignore anything inside the modal
    const href = (a.getAttribute("href") || "").toLowerCase();
    const txt = (a.textContent || "").trim().toLowerCase();
    return (
      href.endsWith("/contact.html") ||
      href.endsWith("/contact") ||
      href === "#contact" ||
      href.includes("contact") ||
      txt === "contact" ||
      txt.includes("contact")
    );
  }

  function wireTriggers(root) {
    // 1) Explicit triggers
    qsa(root || document, "[data-contact-open]").forEach((el) => {
      if (!el.__contactWired) {
        el.__contactWired = true;
        el.addEventListener("click", (e) => {
          if (e.button === 0 && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            open();
          }
        });
      }
    });

    // 2) Existing links that look like Contact (nav/footer/etc.)
    qsa(root || document, "a").forEach((a) => {
      if (looksLikeContactLink(a) && !a.__contactWired) {
        a.__contactWired = true;
        a.setAttribute("data-contact-open", "");
        a.addEventListener("click", (e) => {
          if (e.button === 0 && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            open();
          }
        });
      }
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
    syncThemeFromSite();
    wireTriggers(document);
  });

  // Rewire if header/footer is injected late.
  let retries = 4;
  const late = () => { wireTriggers(document); if (retries-- > 0) setTimeout(late, 300); };
  onReady(() => setTimeout(late, 200));
})();
