// public/assets/js/ux-accessibility.js
// Minimal helpers WITHOUT injecting a Skip link, and remove any stray close buttons.
// Does not touch footer or nav content.

/* eslint-disable no-console */
(function () {
  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      queueMicrotask(fn);
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  function removeAll(selector) {
    try { document.querySelectorAll(selector).forEach((el) => el.remove()); } catch (_) {}
  }

  // 1) Do NOT add a "Skip to content" link; remove any pre-existing one.
  function removeSkipLinks() {
    removeAll(".skip-link");
    document.querySelectorAll('a[href^="#"][class*="skip"]').forEach((a) => a.remove());
  }

  // 2) Remove stray close buttons (e.g., mobile drawer or modal buttons that leaked).
  function removeStrayCloseButtons() {
    removeAll(".nav-close");
    removeAll(".drawer-close");
    removeAll('button[aria-label="Close navigation"]');
    removeAll('button[aria-label="Close"]');
  }

  function enableFocusOutlineOnKeyboard() {
    function set(on) { document.documentElement.classList.toggle("using-keyboard", !!on); }
    window.addEventListener("keydown", (e) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow")) set(true);
    });
    window.addEventListener("mousedown", () => set(false));
    window.addEventListener("touchstart", () => set(false));
  }

  function sweep() {
    removeSkipLinks();
    removeStrayCloseButtons();
  }

  onReady(() => {
    sweep();
    enableFocusOutlineOnKeyboard();
  });

  // A few late sweeps in case other scripts inject after load.
  let retries = 4;
  const late = () => { sweep(); if (retries-- > 0) setTimeout(late, 300); };
  onReady(() => setTimeout(late, 200));
})();
