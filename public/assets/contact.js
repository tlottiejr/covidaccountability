// public/assets/contact.js
// CSP-friendly contact modal (no inline styles). Square corners, smaller.
// Fixes: one Close button (bottom), buttons work (direct listeners),
// "Email Us" shows provider picker; provider opens in new tab and closes modal.

(function () {
  const CSS_HREF = "/assets/contact.css";
  const CSS_ID = "contact-modal-css";
  let built = false;
  let lastActive = null;
  let isOpen = false;

  const qs = (root, sel) => (root || document).querySelector(sel);
  const qsa = (root, sel) => Array.from((root || document).querySelectorAll(sel));

  function ensureStyles() {
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement("link");
      link.id = CSS_ID;
      link.rel = "stylesheet";
      link.href = CSS_HREF;
      document.head.appendChild(link);
    }
    // Derive site link color and set --contact-link
    const probe = document.querySelector("a[href]");
    if (probe) {
      try {
        const color = getComputedStyle(probe).color;
        document.documentElement.style.setProperty("--contact-link", color);
      } catch {}
    }
  }

  function build() {
    if (built) return;
    built = true;

    // Overlay (visual only)
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

    // Header (title only — no close up here)
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

    const mailto = document.querySelector('a[href^="mailto:"]');
    const emailAddr = mailto ? mailto.getAttribute("href").replace(/^mailto:/i, "").split("?")[0] : "";
    body.innerHTML = `
      <p>Don’t hesitate to reach out regarding any questions or issues.</p>
      ${emailAddr
        ? `<p>You can email us directly at <a href="mailto:${emailAddr}" data-contact-ignore>${emailAddr}</a>.</p>`
        : `<p>You can also use the “Email Us” button below.</p>`}
    `;

    // Actions (Email + Close)
    const actions = document.createElement("div");
    actions.className = "contact-actions";

    const emailBtn = document.createElement("button");
    emailBtn.type = "button";
    emailBtn.className = "contact-btn";
    emailBtn.textContent = "Email Us";
    emailBtn.setAttribute("data-contact-email", "");

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "contact-btn secondary";
    closeBtn.textContent = "Close";
    closeBtn.setAttribute("data-contact-close", "");

    actions.appendChild(emailBtn);
    actions.appendChild(closeBtn);

    // Assemble
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(actions);
    dialog.appendChild(panel);

    // Mount once
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // DIRECT LISTENERS (no delegation issues)

    // Close (bottom button)
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });

    // Email provider picker
    emailBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showProviderPicker(dialog, emailAddr);
    });

    // Escape key / focus trap
    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
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

    // focus first actionable control
    const first = dialog.querySelector(".contact-btn");
    if (first) first.focus();
  }

  function close() {
    const overlay = qs(document, ".contact-overlay");
    const dialog  = qs(document, ".contact-dialog");
    if (!overlay || !dialog) return;

    overlay.setAttribute("aria-hidden", "true");
    dialog.setAttribute("aria-hidden", "true");
    isOpen = false;

    // remove provider list if present
    const providers = dialog.querySelector(".contact-providers");
    if (providers) providers.remove();

    if (lastActive && typeof lastActive.focus === "function") {
      lastActive.focus();
      lastActive = null;
    }
  }

  // --- Provider picker ---

  function buildProviderHref(toEmail, subject, body) {
    const enc = encodeURIComponent;
    return {
      gmail:   `https://mail.google.com/mail/?view=cm&to=${enc(toEmail)}&su=${enc(subject)}&body=${enc(body)}`,
      outlook: `https://outlook.live.com/owa/?path=/mail/action/compose&to=${enc(toEmail)}&subject=${enc(subject)}&body=${enc(body)}`,
      yahoo:   `https://compose.mail.yahoo.com/?to=${enc(toEmail)}&subject=${enc(subject)}&body=${enc(body)}`,
      default: `mailto:${toEmail}?subject=${enc(subject)}&body=${enc(body)}`
    };
  }

  function showProviderPicker(dialog, toEmail) {
    if (!toEmail) {
      // Fallback if we couldn't find a mailto on the page
      window.location.href = "/contact.html";
      return;
    }

    const subject = "Inquiry from COVID Accountability Now";
    const body    = "Hi,\n\nI have a question regarding your site. Please get back to me when you can.\n\nThanks,\n";
    const hrefs   = buildProviderHref(toEmail, subject, body);

    // Remove old picker if exists
    const existing = dialog.querySelector(".contact-providers");
    if (existing) existing.remove();

    const list = document.createElement("div");
    list.className = "contact-providers";
    list.innerHTML = `
      <a class="contact-provider" href="${hrefs.gmail}"   target="_blank" rel="noopener" data-contact-ignore><strong>Gmail</strong><small>Open compose</small></a>
      <a class="contact-provider" href="${hrefs.outlook}" target="_blank" rel="noopener" data-contact-ignore><strong>Outlook.com</strong><small>Open compose</small></a>
      <a class="contact-provider" href="${hrefs.yahoo}"   target="_blank" rel="noopener" data-contact-ignore><strong>Yahoo Mail</strong><small>Open compose</small></a>
      <a class="contact-provider" href="${hrefs.default}" target="_blank" rel="noopener" data-contact-ignore><strong>Default Mail App</strong><small>Use mailto</small></a>
    `;

    const actions = dialog.querySelector(".contact-actions");
    actions.after(list);

    // Clicking any provider opens compose in new tab and closes modal
    qsa(list, "a.contact-provider").forEach((a) => {
      a.addEventListener("click", (e) => {
        // allow browser to open new tab, then close
        setTimeout(close, 0);
      });
    });

    // focus first provider
    const first = list.querySelector("a.contact-provider");
    if (first) first.focus();
  }

  // --- Auto-wire header/footer Contact links ---

  function looksLikeContactLink(a) {
    if (!a || a.tagName !== "A") return false;
    if (a.hasAttribute("data-contact-ignore")) return false; // ignore modal internals
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
  // rewire late-inserted nav/footer
  let retries = 4;
  const late = () => { wireTriggers(document); if (retries-- > 0) setTimeout(late, 300); };
  ready(() => setTimeout(late, 200));
})();
