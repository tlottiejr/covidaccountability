# Ops & Health Runbook

## Scheduled jobs
- **Uptime & Smoke (daily)**: `reports/uptime-YYYYMMDDTHHMMSSZ.json` + `reports/LATEST.uptime.json`.
- **Link Health — References (daily)**: raw Lychee JSON in artifacts, summary in `reports/LATEST.references.json`.
  - If totals change, bot PR updates `public/assets/health/references.json` (drives the "Last checked" badge).
- **HTML validation (W3C vnu, live)**: vnu output attached as artifact (warn-only).

## Retention
- Visual diffs: 14 days
- vnu logs: 14 days
- Link-health & uptime artifacts: 30 days

## Notes
- All jobs are **warn-only**; deploys never block.
- To run any job on-demand: Actions → select workflow → **Run workflow**.

### D1 → state-links runbook
- To refresh JSON:
  - GitHub Actions → “D1 → state-links.json (export)” → Run workflow.
- If the job **fails** at the guard (states < 50):
  - Check D1 counts in Cloudflare Studio:
    - `SELECT COUNT(*) FROM states;` (expect 56)
    - `SELECT COUNT(*) FROM boards;` (expect > 0)
  - If D1 is correct, check exporter logs (“Unknown wrangler JSON shape”). Update parser (scripts/export-state-links-from-d1.mjs).
- If the site breaks (dropdown empty):
  - Revert `public/assets/state-links.json` to last good commit.
  - Re-run the export workflow.

### Routine checks (monthly)
- Verify Pages deploys show “no changes” when nothing updated.
- Spot-check 2–3 states with multiple boards.
- Verify nightly backup artifacts exist (Actions → d1-backup).
