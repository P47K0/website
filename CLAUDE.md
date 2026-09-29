# CLAUDE.md

General project conventions live in [CONVENTIONS.md](CONVENTIONS.md). The about.md export marker vocabulary is documented in [README.md](README.md#aboutmd-export-markers).

## about.md export markers: CI rule

The about.md CI check (`scripts/export_about_md.py`, run by `.github/workflows/about-md-markers.yml`) must fail when:

- a project card, certification or work-style item in `public/index.html` lacks `data-md-item`. That means every `.app-card`, every `.cert` and every `.mp-item[data-project]`. The `.mp-item` rows without `data-project` (CKA lab, K8s automation) are exported from their DevOps cards instead and stay unmarked;
- a `data-md-item` lacks exactly one `data-md-title`;
- a `data-md-stat` lacks a numeric `data-md-value`. The one exception is date-based stats, whose counters are computed in the browser from today's date. They use a `Month YYYY` start date ("In IT since: January 2000"), because a number would go stale at the next anniversary.

When adding or changing homepage content, add the markers in the same change so the check keeps passing. Never weaken the check to make a change pass.

## llms-full.txt

`public/llms-full.txt` is the exporter's output, committed as-is: the same Markdown as about.md. After any change that affects the export (homepage content, markers, counter scripts, the exporter), regenerate it in the same change with `python3 scripts/export_about_md.py > public/llms-full.txt`. The about.md workflow fails when it's out of date. Never edit it by hand.
