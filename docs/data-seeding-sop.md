# Data Seeding SOP — State Medical Board Complaint Links (v1)

**Goal**  
Seed **every official “File a Complaint” link** for all **50 states + DC** into `/public/assets/state-links.json`. Always capture the **final landing URL** reached after clicking the “File a Complaint” button on the FSMB directory.

---

## Roles
- **Seeder** — Finds links and records entries.
- **Reviewer** — Independently verifies final URLs and approves.
- **Maintainer** — Merges, runs audits, resolves edge cases.

## Source & Rules
1. Start at FSMB: “Contact a State Medical Board.”
2. Click **“File a Complaint.”** Follow any redirects to the **final** landing page.
3. If a state has multiple official boards/portals (e.g., MD board + osteopathic, or a licensure commission), add **each** as a separate entry under that state.
4. Prefer **HTTPS** and official **state/board** domains. Avoid aggregators and third-party blogs.
5. If you must choose a canonical default, mark one entry `"primary": true` (others `false`).

## Data shape (per state)
```json
{
  "code": "CA",
  "name": "California",
  "links": [
    {
      "board": "Medical Board of California",
      "url": "https://FINAL-LANDING-URL",
      "source": "https://www.fsmb.org/contact-a-state-medical-board/",
      "primary": true
    },
    {
      "board": "Osteopathic Medical Board of California",
      "url": "https://FINAL-LANDING-URL",
      "source": "https://www.fsmb.org/contact-a-state-medical-board/",
      "primary": false
    }
  ]
}
