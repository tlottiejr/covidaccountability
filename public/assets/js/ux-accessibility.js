// public/assets/js/ux-accessibility.js
// Purpose: minimal a11y helpers WITHOUT injecting a Skip link,
// and remove any stray close buttons and pre-existing skip links.

/* eslint-disable no-console */
(function () {
  // Helper: run after DOM is ready, but also handle late-inserted elements.
  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      queueMicrotask(fn);
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  // Remove elements matching a selector (defensive).
  function removeAll(selector) {
    try {
      document.querySelectorAll(selector).forEach((el) => el.remove());
    } catch (_) {
      /* ignore */
    }
  }

  // We purposely DO NOT inject a "Skip to content" link here.
  // If one exists from prior markup/scripts, remove it so it doesn't show up.
  function removeSkipLinks() {
    removeAll(".skip-link");
    // Some generators use role=link and textContent. Be conservative:
    // hide visually if removal isn't desired (fallback).
    document.querySelectorAll('a[href^="#"][class*="skip"]').forEach((a) => a.remove());
  }

  // Remove any stray close buttons created by nav scripts/CSS clashes.
  function removeStrayNavCloseButtons() {
    removeAll(".nav-close");
    removeAll(".drawer-close");
    removeAll('button[aria-label="Close navigation"]');
    // Extra safety: tiny single-char × buttons commonly end up as just "x"
    // but we avoid text-based heuristics to prevent false positives.
  }

  // Optional: keep keyboard focus outlines visible when tabbing (no UI injection).
  function enableFocusOutlineOnKeyboard() {
    let usingKeyboard = false;
    function setUsingKeyboard() {
      usingKeyboard = true;
      document.documentElement.classList.add("using-keyboard");
    }
    function setUsingMouse() {
      usingKeyboard = false;
      document.documentElement.classList.remove("using-keyboard");
    }
    window.addEventListener("keydown", (e) => {
      if (e.key === "Tab" || e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        setUsingKeyboard();
      }
    });
    window.addEventListener("mousedown", setUsingMouse);
    window.addEventListener("touchstart", setUsingMouse);
  }

  onReady(() => {
    // Remove both unwanted UI bits
    removeSkipLinks();
    removeStrayNavCloseButtons();

    // Keep focus-visible UX without adding any DOM
    enableFocusOutlineOnKeyboard();
  });

  // If another script injects them late (after load), re-check a couple times.
  // This avoids flicker without a MutationObserver (keeps this file tiny).
  let retries = 3;
  const lateSweep = () => {
    removeSkipLinks();
    removeStrayNavCloseButtons();
    if (retries-- > 0) setTimeout(lateSweep, 250);
  };
  onReady(() => setTimeout(lateSweep, 150));
})();
