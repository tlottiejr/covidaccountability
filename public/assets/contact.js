// public/assets/contact.js
// Minimal CSP-friendly contact modal:
// - One Close button (bottom).
// - Shows static email text.
// - Page doesn't freeze (overlay is visual only).
// - Close works even if other scripts stop propagation (capturing listener).

(function () {
  const CSS_HREF = "/assets/contact.css";
  const CSS_ID = "contact-modal-css";

  let built = false;
  let isOpen = false;
  let lastActive = null;

  const qs  = (root, sel) => (root || document).querySelector(sel);
  const qsa = (root, sel) => Array.from((root || document).querySelectorAll(sel));

  function ensureStyles() {
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement("link");
      link.id = CSS_ID;
      link.rel = "stylesheet";
      link.href = CSS_HREF;
      document.head.appendChild(link);
    }
    // Match site link color
    const probe = document.querySelector("a[href]");
    if (probe) {
      try {
        const color = getComputedStyle(probe).color;
        document.documentElement.style.setProperty("--contact-link", color);
      } catch {}
    }
  }

  function cleanupOld() {
    // Remove any prior instances left by older builds
    qsa(document, ".contact-overlay, .contact-dialog").forEach((el) => el.remove());
  }

  function build() {
    if (built) return;
    built = true;

    cleanupOld();

    // Overlay (visual only)
    const overlay = document.createElement("div");
    overlay.className = "contact-overlay";
    overlay.setAttribute("aria-hidden", "true");

    // Dialog
    const dialog = document.createElement("div");
    dialog.className = "contact-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-hidden", "true");

    // Panel
    const panel = document.createElement("div");
    panel.className = "contact-panel";

    // Header (title only)
    const header = document.createElement("div");
    header.className = "contact-header";
    const title = document.createElement("h2");
    title.className = "contact-title";
    title.id = "contact-title";
    title.textContent = "Contact Us";
    header.appendChild(title);

    // Body
    const body = document.createElement("div");
    body.className = "contact-body";
    body.id = "contact-desc";
    body.innerHTML = `
      <p>Don’t hesitate to reach out regarding any questions or issues.</p>
      <p>Email: info@covidaccountabilitynow.com</p>
    `;

    // Actions (single Close)
    const actions = document.createElement("div");
    actions.className = "contact-actions";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "contact-btn secondary";
    closeBtn.textContent = "Close";
    closeBtn.setAttribute("data-contact-close", ""); // tag for global handler
    actions.appendChild(closeBtn);

    // Assemble
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(actions);
    dialog.appendChild(panel);
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // Direct listener on the button (fast path)
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });

    // Keyboard: ESC + basic focus trap
    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        const focusables = qsa(
          panel,
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input,select,textarea'
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    // SAFETY NET: capturing-phase global click handler
    // Ensures Close works even if other code stops bubbling
    document.addEventListener(
      "click",
      (e) => {
        if (!isOpen) return;
        const t = e.target;
        if (t && (t.closest('[data-contact-close]') || t.closest('.contact-btn.secondary'))) {
          e.preventDefault();
          close();
        }
      },
      true // capture!
    );

    // ARIA wiring
    dialog.setAttribute("aria-labelledby", title.id);
    dialog.setAttribute("aria-describedby", body.id);

    // Expose helpers for quick manual debug if needed
    // Object.assign(window, { contact_open: open, contact_close: close });
  }

  function open() {
    ensureStyles();
    build();
    const overlay = qs(document, ".contact-overlay");
    const dialog  = qs(document, ".contact-dialog");
    if (!overlay || !dialog) return;

    lastActive = document.activeElement;
    overlay.setAttribute("aria-hidden", "false");
    dialog.setAttribute("aria-hidden", "false");
    isOpen = true;

    // Focus Close for easy dismissal
    const closeBtn = dialog.querySelector(".contact-btn.secondary");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    const overlay = qs(document, ".contact-overlay");
    const dialog  = qs(document, ".contact-dialog");
    if (!overlay || !dialog) return;

    overlay.setAttribute("aria-hidden", "true");
    dialog.setAttribute("aria-hidden", "true");
    isOpen = false;

    if (lastActive && typeof lastActive.focus === "function") {
      lastActive.focus();
      lastActive = null;
    }
  }

  // --- Auto-wire header/footer Contact links ---

  function looksLikeContactLink(a) {
    if (!a || a.tagName !== "A") return false;
    if (a.hasAttribute("data-contact-ignore")) return false;
    if (a.closest(".contact-dialog")) return false;
    const href = (a.getAttribute("href") || "").toLowerCase();
    const txt  = (a.textContent || "").trim().toLowerCase();
    return (
      href.endsWith("/contact.html") || href.endsWith("/contact") ||
      href === "#contact" || href.includes("contact") ||
      txt === "contact" || txt.includes("contact")
    );
  }

  function wireTriggers(root) {
    // Explicit triggers
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
    // Existing "Contact" links
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

  function ready(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      queueMicrotask(fn);
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  ready(() => {
    ensureStyles();
    wireTriggers(document);
  });

  // Rewire late-inserted nav/footer if needed
  let retries = 4;
  const late = () => { wireTriggers(document); if (retries-- > 0) setTimeout(late, 300); };
  ready(() => setTimeout(late, 200));
})();
