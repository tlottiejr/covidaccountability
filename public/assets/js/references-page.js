// public/assets/js/references-page.js
// Render inside the existing card that shows "Loading…", so we inherit page styles.

const $ = (s, r = document) => r.querySelector(s);

function findStatusAndMount() {
  // Find the "Loading..." node
  let status =
    $("[data-ref-status]") ||
    $("#references-status") ||
    $(".references-status") ||
    $(".status");

  if (!status) {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (tw.nextNode()) {
      const t = (tw.currentNode.textContent || "").trim().toLowerCase();
      if (t === "loading..." || t === "loading…") {
        status = tw.currentNode;
        break;
      }
    }
  }

  // Mount = the card that CONTROLS layout on this page (parent .card if present)
  let mount = null;
  if (status) {
    // prefer a nearby empty sibling as mount (common pattern: <div class="card"><div class="status">Loading…</div><div></div></div>)
    if (status.nextElementSibling && status.nextElementSibling.children.length === 0) {
      mount = status.nextElementSibling;
    } else {
      // else, render inside the same parent (keeps card padding/border/shadow)
      mount = status.parentElement;
    }
  }

  return { status, mount };
}

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function fetchWithFallback(candidates) {
  let lastErr;
  for (const u of candidates) {
    try {
      return await getJSON(u);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all URLs failed");
}

function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) {
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
}

async function render() {
  const { status, mount } = findStatusAndMount();
  if (!mount) return; // graceful no-op if markup changes again

  // Update "Last checked"
  try {
    const health = await fetchWithFallback([
      "/assets/health/references.json",
      "/assets/health/references/index.json",
      "/assets/health/references/latest.json",
    ]);
    const last =
      health?.lastChecked ||
      health?.generated_at ||
      health?.generatedAt ||
      health?.date ||
      null;
    const lc =
      $("[data-ref-lastchecked]") ||
      $("#last-checked") ||
      document.querySelector('time[datetime][data-role="last-checked"]');
    if (lc) lc.textContent = last ? new Date(last).toLocaleString() : "—";
  } catch {
    const lc =
      $("[data-ref-lastchecked]") ||
      $("#last-checked") ||
      document.querySelector('time[datetime][data-role="last-checked"]');
    if (lc) lc.textContent = "—";
  }

  // Load references and render INSIDE the existing card
  try {
    const items = await fetchWithFallback([
      "/assets/references.json",
      "/assets/data/references.json",
      "/assets/references/index.json",
    ]);

    // Remove just the status line; keep the card container and its padding/shadow
    if (status && status.parentElement) status.remove();

    if (!Array.isArray(items) || items.length === 0) {
      mount.appendChild(el("p", { class: "muted" }, "No references available."));
      return;
    }

    // Build list that relies on your page's existing typography and spacing
    const ul = el("ul", { role: "list" });
    for (const r of items) {
      const title = r.title || r.name || r.url || "Untitled";
      const url = r.url || "#";
      const metaParts = [];
      if (r.source) metaParts.push(r.source);
      if (r.date) metaParts.push(r.date);
      const meta = metaParts.join(" · ");

      const li = el("li", {}, [
        el("a", { href: url, target: "_blank", rel: "noopener nofollow" }, title),
        meta ? el("div", { class: "muted" }, meta) : null,
        r.description ? el("p", {}, r.description) : null,
      ]);
      ul.appendChild(li);
    }

    mount.appendChild(ul);
  } catch (err) {
    if (status) status.textContent = "Failed to load references. Please try again later.";
    console.error("[references] fetch error:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render);
} else {
  render();
}
