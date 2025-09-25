// public/assets/contact.js
// Minimal CSP-friendly contact modal (singleton).
// Fix: dialog is now actually hidden on close (CSS + explicit display toggle).

(function () {
  if (window.__CAN_CONTACT_INIT__) return;
  window.__CAN_CONTACT_INIT__ = true;

  const CSS_HREF = "/assets/contact.css";
  const CSS_ID = "contact-modal-css";
  const OVERLAY_SEL = ".contact-overlay";
  const DIALOG_SEL = ".contact-dialog";

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
    const probe = document.querySelector("a[href]");
    if (probe) {
      try {
        const color = getComputedStyle(probe).color;
        document.documentElement.style.setProperty("--contact-link", color);
      } catch {}
    }
  }

  function cleanupOldInstances() {
    qsa(document, `${OVERLAY_SEL}, ${DIALOG_SEL}`).forEach((el) => el.remove());
  }

  function buildOnce() {
    if (built) return;
    built = true;

    cleanupOldInstances();

    const overlay = document.createElement("div");
    overlay.className = "contact-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const dialog = document.createElement("div");
    dialog.className = "contact-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-hidden", "true");
    dialog.style.display = "none"; // explicit hidden

    const panel = document.createElement("div");
    panel.className = "contact-panel";

    const header = document.createElement("div");
    header.className = "contact-header";
    const title = document.createElement("h2");
    title.className = "contact-title";
    title.id = "contact-title";
    title.textContent = "Contact Us";
    header.appendChild(title);

    const body = document.createElement("div");
    body.className = "contact-body";
    body.id = "contact-desc";
    body.innerHTML = `
      <p>Don’t hesitate to reach out regarding any questions or issues.</p>
      <p>Email: info@covidaccountabilitynow.com</p>
    `;

    const actions = document.createElement("div");
    actions.className = "contact-actions";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "contact-btn secondary";
    closeBtn.textContent = "Close";
    closeBtn.setAttribute("data-contact-close", "");
    actions.appendChild(closeBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(actions);
    dialog.appendChild(panel);
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });

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
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    // Capture-phase safety net
    document.addEventListener(
      "click",
      (e) => {
        if (!isOpen) return;
        const t = e.target;
        if (t && t.closest('[data-contact-close]')) {
          e.preventDefault();
          close();
        }
      },
      true
    );

    dialog.setAttribute("aria-labelledby", title.id);
    dialog.setAttribute("aria-describedby", body.id);
  }

  function open() {
    ensureStyles();
    buildOnce();
    const overlay = qs(document, OVERLAY_SEL);
    const dialog  = qs(document, DIALOG_SEL);
    if (!overlay || !dialog) return;

    lastActive = document.activeElement;

    overlay.setAttribute("aria-hidden", "false");
    dialog.setAttribute("aria-hidden", "false");
    dialog.style.display = "grid";   // ensure visible

    isOpen = true;

    const closeBtn = dialog.querySelector('[data-contact-close]');
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    const overlay = qs(document, OVERLAY_SEL);
    const dialog  = qs(document, DIALOG_SEL);
    if (!overlay || !dialog) return;

    overlay.setAttribute("aria-hidden", "true");
    dialog.setAttribute("aria-hidden", "true");
    dialog.style.display = "none";   // ensure hidden

    isOpen = false;

    if (lastActive && typeof lastActive.focus === "function") {
      lastActive.focus();
      lastActive = null;
    }
  }

  function looksLikeContactLink(a) {
    if (!a || a.tagName !== "A") return false;
    if (a.hasAttribute("data-contact-ignore")) return false;
    if (a.closest(DIALOG_SEL)) return false;
    const href = (a.getAttribute("href") || "").toLowerCase();
    const txt  = (a.textContent || "").trim().toLowerCase();
    return (
      href.endsWith("/contact.html") || href.endsWith("/contact") ||
      href === "#contact" || href.includes("contact") ||
      txt === "contact" || txt.includes("contact")
    );
  }

  function wireTriggers(root) {
    const scope = root || document;

    qsa(scope, "[data-contact-open]").forEach((el) => {
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

    qsa(scope, "a").forEach((a) => {
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

  let retries = 4;
  const late = () => { wireTriggers(document); if (retries-- > 0) setTimeout(late, 300); };
  ready(() => setTimeout(late, 200));
})();
