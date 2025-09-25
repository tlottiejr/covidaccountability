// public/assets/contact.js
// CSP-friendly contact modal: no inline styles, square corners, theme-aware.
// Fixes: Close button works (robust delegation), Email flow shows provider picker.
// Providers open in a new tab and the modal closes automatically.

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
    const probe = document.querySelector("a[href]");
    if (!probe) return;
    try {
      const computed = getComputedStyle(probe).color;
      document.documentElement.style.setProperty("--contact-link", computed);
    } catch {}
  }

  const qs = (root, sel) => (root || document).querySelector(sel);
  const qsa = (root, sel) => Array.from((root || document).querySelectorAll(sel));

  function buildOnce() {
    if (modalReady) return;
    modalReady = true;

    // Overlay (visual only; page scroll remains)
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
    closeBtn.setAttribute("data-contact-close", ""); // for delegation

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement("div");
    body.className = "contact-body";
    body.id = "contact-desc";

    // Reuse existing mailto link if present
    const mailtoEl = document.querySelector('a[href^="mailto:"]');
    const emailHref = mailtoEl ? mailtoEl.getAttribute("href") : null;
    const emailAddr = emailHref ? emailHref.replace(/^mailto:/i, "").split("?")[0] : "";

    body.innerHTML = `
      <p>Don’t hesitate to reach out regarding any questions or issues.</p>
      ${emailAddr
        ? `<p>You can email us directly at <a href="mailto:${emailAddr}" data-contact-ignore>${emailAddr}</a>.</p>`
        : `<p>You can also use the “Email Us” button below.</p>`}
    `;

    // Actions (primary Email, secondary Close)
    const actions = document.createElement("div");
    actions.className = "contact-actions";

    const emailBtn = document.createElement("button");
    emailBtn.type = "button";
    emailBtn.className = "contact-btn";
    emailBtn.textContent = "Email Us";
    emailBtn.setAttribute("data-contact-email", ""); // triggers provider picker

    const closeBtn2 = document.createElement("button");
    closeBtn2.type = "button";
    closeBtn2.className = "contact-btn secondary";
    closeBtn2.textContent = "Close";
    closeBtn2.setAttribute("data-contact-close", "");

    actions.appendChild(emailBtn);
    actions.appendChild(closeBtn2);

    // Assemble
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(actions);
    dialog.appendChild(panel);

    // Mount
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // Global key handlers
    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        // focus trap
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

    // Robust click delegation (fixes edge cases where direct listeners miss)
    document.addEventListener("click", (e) => {
      const t = e.target;
      // Close buttons
      if (t && (t.closest('[data-contact-close]') || t.closest('.contact-close'))) {
        e.preventDefault();
        close();
        return;
      }
      // Provider links (inside modal)
      const provider = t && t.closest("a.contact-provider");
      if (isOpen && provider) {
        // open in new tab and close modal
        e.preventDefault();
        window.open(provider.href, "_blank", "noopener");
        close();
      }
    });

    // Expose helpers on window for debugging if needed:
    // Object.assign(window, { contact_open: open, contact_close: close });
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

    // Focus first action
    const first = dialog.querySelector(".contact-btn, .contact-close");
    if (first) first.focus();
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

    // Reset provider UI if it was shown
    const providers = document.querySelector(".contact-providers");
    if (providers) providers.remove();
  }

  // --- Provider picker ---

  function buildProviderHref(baseEmail, subject, body) {
    const enc = encodeURIComponent;
    return {
      defaultMail: `mailto:${baseEmail}?subject=${enc(subject)}&body=${enc(body)}`,
      gmail: `https://mail.google.com/mail/?view=cm&to=${enc(baseEmail)}&su=${enc(subject)}&body=${enc(body)}`,
      outlook: `https://outlook.live.com/owa/?path=/mail/action/compose&to=${enc(baseEmail)}&subject=${enc(subject)}&body=${enc(body)}`,
      yahoo: `https://compose.mail.yahoo.com/?to=${enc(baseEmail)}&subject=${enc(subject)}&body=${enc(body)}`,
      proton: `mailto:${baseEmail}?subject=${enc(subject)}&body=${enc(body)}`, // Proton respects mailto handler
    };
  }

  function showProviderPicker() {
    const dialog = qs(document, ".contact-dialog");
    if (!dialog) return;

    const mailtoEl = document.querySelector('a[href^="mailto:"]');
    const emailAddr = mailtoEl ? mailtoEl.getAttribute("href").replace(/^mailto:/i, "").split("?")[0] : "";
    if (!emailAddr) {
      // Fallback: just navigate to /contact.html in same tab
      window.location.href = "/contact.html";
      return;
    }

    const subject = "Inquiry from COVID Accountability Now";
    const body =
      "Hi,\n\nI have a question regarding your site. Please get back to me when you can.\n\nThanks,\n";
    const hrefs = buildProviderHref(emailAddr, subject, body);

    // If already present, replace it
    const exist = qs(dialog, ".contact-providers");
    if (exist) exist.remove();

    const container = document.createElement("div");
    container.className = "contact-providers";
    container.innerHTML = `
      <a class="contact-provider" href="${hrefs.gmail}" data-contact-ignore>
        <strong>Gmail</strong> <small>Open compose</small>
      </a>
      <a class="contact-provider" href="${hrefs.outlook}" data-contact-ignore>
        <strong>Outlook.com</strong> <small>Open compose</small>
      </a>
      <a class="contact-provider" href="${hrefs.yahoo}" data-contact-ignore>
        <strong>Yahoo Mail</strong> <small>Open compose</small>
      </a>
      <a class="contact-provider" href="${hrefs.defaultMail}" data-contact-ignore>
        <strong>Default Mail App</strong> <small>Use mailto</small>
      </a>
    `;
    const actions = qs(dialog, ".contact-actions");
    if (actions) actions.after(container);

    // Focus first provider
    const first = container.querySelector("a.contact-provider");
    if (first) first.focus();
  }

  // --- Auto-wiring (header/footer links) ---

  function looksLikeContactLink(a) {
    if (!a || a.tagName !== "A") return false;
    if (a.hasAttribute("data-contact-ignore")) return false; // ignore modal internals
    if (a.closest(".contact-dialog")) return false;
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

    // Contact-looking links
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

    // Inside the modal: click on the Email button shows provider picker
    document.addEventListener("click", (e) => {
      const emailBtn = e.target && e.target.closest("[data-contact-email]");
      if (isOpen && emailBtn) {
        e.preventDefault();
        showProviderPicker();
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
