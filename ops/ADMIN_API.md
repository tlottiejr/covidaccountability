# Admin API — COVID Accountability Now

This document shows how to use the Admin API for managing **boards** in the D1 database.  
The API is authenticated via a **Bearer token** set as an environment variable in Cloudflare Pages:
`ADMIN_API_TOKEN`.

**Base URL:**  
- Production: `https://covidaccountability.pages.dev`
- (If testing a PR) use the Preview URL shown by Cloudflare Pages for that deploy.

> After making edits via the Admin API, run the GitHub Action  
> **“D1 → state-links.json (export)”** to publish the portal JSON.

---

## 0) Prerequisites

- You must have the **ADMIN_API_TOKEN** value from Cloudflare Pages → Project → **Settings → Environment variables**.
- Keep this token private. Do not commit it.

---

## 1) Quick smoke tests

### Health
```bash
curl -s https://covidaccountability.pages.dev/admin/health | jq
