# Admin API — COVID Accountability Now (Sprint B)

Manage `boards` in Cloudflare D1 through a small authenticated Admin API. After edits, run the existing **export** workflow to publish `/public/assets/state-links.json` for the portal.

---

## Base URL & Auth

- **Production base:** `https://covidaccountability.pages.dev`
- **Preview base:** the Cloudflare Pages *Preview* URL for the current deployment.
- **Auth:** Every request must include  
  `Authorization: Bearer <ADMIN_API_TOKEN>`
- **Where to set token:** Cloudflare Pages → your Project → **Settings → Environment variables** (name: `ADMIN_API_TOKEN`).  
  For local/preview use, you can also set it in your shell as shown below.

---

## 0) Prerequisites (shell setup)

> You can run these commands on **macOS/Linux** (Terminal) or **Windows** (PowerShell). When you see a *bash* example, Windows users can use the PowerShell variant shown alongside.

### 0.1 — Set these in your shell (bash)

~~~bash
TOKEN="PASTE_YOUR_TOKEN_HERE"
BASE="https://covidaccountability.pages.dev"
# For preview deploys, set BASE to the preview URL
~~~

### 0.2 — Tools (if needed)

- macOS: `brew install curl jq`
- Ubuntu/Debian: `sudo apt-get install -y curl jq`

### 0.3 — PowerShell helper (Windows)

~~~powershell
$Token = "PASTE_YOUR_TOKEN_HERE"
$Base  = "https://covidaccountability.pages.dev"
$Auth  = @{ Authorization = "Bearer $Token" }
$JsonH = @{ "Content-Type" = "application/json" }
~~~

---

## 1) Health (sanity)

### curl

~~~bash
curl -s "$BASE/admin/health" | jq
~~~

### PowerShell

~~~powershell
Invoke-RestMethod -Uri "$Base/admin/health" -Method Get
~~~

**Expected output (shape)**

~~~json
{
  "ok": true,
  "service": "admin-api",
  "ts": 1691234567
}
~~~

---

## 2) List boards for a state

### curl

~~~bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/admin/boards?state=MI" | jq
~~~

### PowerShell

~~~powershell
Invoke-RestMethod -Uri "$Base/admin/boards?state=MI" -Headers $Auth -Method Get
~~~

**Expected output (shape)**

~~~json
[
  {
    "id": 101,
    "state_code": "MI",
    "board": "Michigan LARA",
    "url": "https://...",
    "primary_flag": 1,
    "active": 1
  },
  {
    "id": 102,
    "state_code": "MI",
    "board": "MI Osteopathic Board",
    "url": "https://...",
    "primary_flag": 0,
    "active": 1
  }
]
~~~

**Notes**
- `state` (2-letter code) is **required**.
- Results are ordered: primary first, then others.

---

## 3) Create a board (non-primary **or** primary)

### curl (non-primary)

~~~bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"state_code":"MI","board":"Michigan LARA — Test","url":"https://example.org/complaints","primary":false}' \
  "$BASE/admin/boards" | jq
~~~

### curl (primary; will demote other primaries for this state)

~~~bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"state_code":"MI","board":"Michigan LARA — Primary Test","url":"https://example.org/complaints","primary":true}' \
  "$BASE/admin/boards" | jq
~~~

### PowerShell (primary)

~~~powershell
$Body = @{
  state_code = "MI"
  board      = "Michigan LARA — Primary Test"
  url        = "https://example.org/complaints"
  primary    = $true
} | ConvertTo-Json
Invoke-RestMethod -Uri "$Base/admin/boards" -Headers $JsonH -Method Post -Body $Body -Headers $Auth
~~~

**Expected output (shape)**

~~~json
{
  "id": 123,
  "state_code": "MI",
  "board": "Michigan LARA — Test",
  "url": "https://example.org/complaints",
  "primary_flag": 0,
  "active": 1,
  "created_at": "2025-09-18T03:55:00Z"
}
~~~

**Notes**
- URL must start with `http://` or `https://`.
- Duplicate **active** `(state_code, board, url)` returns `409`.

---

## 4) Make a board primary (by id)

### curl

~~~bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$BASE/admin/boards/123/primary" | jq
~~~

### PowerShell

~~~powershell
Invoke-RestMethod -Uri "$Base/admin/boards/123/primary" -Headers $Auth -Method Post
~~~

**Expected output (shape)**

~~~json
{
  "id": 123,
  "state_code": "MI",
  "board": "Michigan LARA — Test",
  "url": "https://example.org/complaints",
  "primary_flag": 1,
  "active": 1
}
~~~

---

## 5) Update a board (PATCH)

### curl (change URL)

~~~bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.org/new-url"}' \
  "$BASE/admin/boards/123" | jq
~~~

### PowerShell

~~~powershell
$Body = @{ url = "https://example.org/new-url" } | ConvertTo-Json
Invoke-RestMethod -Uri "$Base/admin/boards/123" -Headers $JsonH -Method Patch -Body $Body -Headers $Auth
~~~

**Expected output (shape)**

~~~json
{
  "id": 123,
  "state_code": "MI",
  "board": "Michigan LARA — Test",
  "url": "https://example.org/new-url",
  "primary_flag": 1,
  "active": 1
}
~~~

---

## 6) Soft delete a board

### curl

~~~bash
curl -i -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$BASE/admin/boards/123"
~~~

### PowerShell

~~~powershell
Invoke-WebRequest -Uri "$Base/admin/boards/123" -Headers $Auth -Method Delete -UseBasicParsing
~~~

**Expected**
- HTTP **204 No Content**  
- Board remains in history (inactive) and is excluded from export.

---

## 7) Publish changes to the portal (export JSON)

Nothing about the portal code changes. We simply export D1 → JSON and commit it.

1. In GitHub → **Actions**, run the workflow: **“D1 → state-links.json (export)”**.
   - It applies migrations (if any), reads D1, validates, and (if changed) commits **`public/assets/state-links.json`**.
2. Cloudflare Pages deploy picks the commit and serves the fresh JSON at  
   **`/assets/state-links.json`** (cache-busted by existing `?v=` token logic).
3. Smoke check:
   - Visit `/complaint-portal`
   - Verify radio options populate, **Open selected board page** opens a **new tab**, and Turnstile success/fallback behavior remains unchanged.

**Tip:** The workflow includes a sanity guard and will **refuse to commit** if the exported JSON has fewer than **50 states**.

---

## 8) Troubleshooting

- **401/403:** Ensure `ADMIN_API_TOKEN` is set in Cloudflare Pages **Environment variables** for **both** Preview and Production (and in your shell when testing locally).
- **409 on create:** You attempted to create a duplicate *active* `(state_code, board, url)`. Either update the existing record or soft-delete first.
- **Primary logic:** Setting a new primary for a state automatically demotes all other primaries in that state.
- **Export shows 0 states:** D1 may be empty or the export query filters are too strict. Re-run the **seed** step (only for initial bootstrap) or ensure the earlier workflow step didn’t fail.
- **Portal doesn’t show new data:** Confirm the export committed `public/assets/state-links.json`, and a Pages deploy completed. Hard refresh or use the `?v=<timestamp>` param to bust caches.

---
