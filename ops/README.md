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
