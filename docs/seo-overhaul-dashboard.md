# SEO Overhaul Dashboard

The internal SEO overhaul dashboard lives at:

- `seo-overhaul-dashboard/index.html`

It is a simple static dashboard for tracking the 4-GPT SEO/UX/content overhaul workflow. It does not require a database, authentication, GitHub token, or new frontend framework.

## Files it reads

- `content/seo-overhaul-tracker.json` — manual source of truth for page status, priority, owner, notes, and next action.
- `LisaDiGiglio_Recommended_Hybrid_Sitemap.md` — human-readable recommended sitemap seed.
- Markdown audit files detected by `scripts/generate-seo-dashboard.mjs`.

The generator writes:

- `src/data/seo-overhaul.generated.json` — generated data for tooling/review.
- `seo-overhaul-dashboard/data.js` — generated browser data loaded by the static dashboard.

## How audit files are detected

Run:

```bash
npm run generate:seo-dashboard
```

The script scans for Markdown audit files matching these conventions:

- `*_Audit.md`
- `*-audit.md`
- `audit-*.md`
- files inside `audits/`
- files inside `seo-audits/`
- files inside `content/audits/`
- files inside `docs/audits/`

The preferred location is:

```text
docs/audits/
```

For each audit file, the script tries to match the audit to a tracker page by file name, URL, or title slug. If an audit file is detected for a page, the dashboard marks that page's audit status as `done` unless the tracker explicitly marks audit as `blocked` or `skipped`.

## Audit date priority

The generator uses the first available date in this order:

1. Markdown frontmatter field: `date`, `audited_at`, or `completed_at`.
2. Git last modified date.
3. File system modified date.
4. `Detected, date unavailable.` if no date is available.

## How to mark statuses as done

Edit `content/seo-overhaul-tracker.json` and update the relevant status fields:

```json
"status": {
  "audit": "done",
  "rewrite": "done",
  "qa": "not_started",
  "internalLinks": "not_started",
  "published": "not_started"
}
```

Supported values are:

- `not_started`
- `in_progress`
- `done`
- `blocked`
- `skipped`

After editing, run:

```bash
npm run generate:seo-dashboard
```

Then commit the tracker and generated dashboard data.

## How to add a new page

Add a new object to `content/seo-overhaul-tracker.json` with:

- `id`
- `title`
- `url`
- `parent`
- `section`
- `primaryKeyword`
- `status`
- `auditFile`
- `auditDate`
- `owner`
- `priority`
- `notes`
- `nextAction`

Then run `npm run generate:seo-dashboard`.

## How to add a new audit file

1. Save the Markdown audit in `docs/audits/`.
2. Include frontmatter when possible:

```markdown
---
date: 2026-07-03
page: Example Page
url: /example-page/
---
```

3. Run `npm run generate:seo-dashboard`.
4. Confirm the dashboard marks the page audit as done.

## Parsed audit details

The parser attempts to extract:

- page title
- URL
- audit date
- score lines
- priority fixes
- handoff summary for GPT 3

If parsing fails, the audit file is still listed and the audit step is still marked done for the matched page.

## Limitations

- This dashboard is static and read-only in the browser.
- Browser changes do not write back to GitHub or the tracker file.
- Permanent updates require editing `content/seo-overhaul-tracker.json`, regenerating data, and committing the change.
- Audit matching is heuristic. If a file does not match automatically, set the page's `auditFile` field in the tracker to the audit file name.
