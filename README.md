# koorevaar.com

Personal website and CV site for Patrick Koorevaar.

The first goal of this repository is to keep the site simple, fast, and cheap to host. The initial version is a static website focused on:

- professional profile
- CV / resume information
- links to LinkedIn, GitHub, and other relevant profiles
- selected side projects
- room for future demo videos and technical write-ups

## Project goals

- Launch quickly with a clean first version.
- Use a modern but lightweight workflow.
- Keep hosting costs at or near zero.
- Make the site easy to maintain and extend.
- Use the site as both a personal CV page and a foundation for future technical demos.

## Current stack

- Static HTML
- Bootstrap for layout and responsive structure
- Small custom CSS layer for branding and personal style
- GitHub for source control
- Cloudflare Pages for deployment and hosting
- Custom domain: `koorevaar.com`

## Why this setup

This setup keeps the site straightforward and practical:

- Static pages are fast and low-maintenance.
- Bootstrap helps ship a clean responsive layout quickly.
- GitHub + Cloudflare Pages gives an easy deployment flow.
- Cloudflare acts as the public edge in front of the site and leaves room for future routing or integration work.

## Planned structure

### Main site

The main domain should stay focused on professional identity:

- homepage
- short introduction
- experience summary
- skills overview
- selected projects
- CV download
- contact / profile links

### Future additions

Possible additions later:

- embedded demo videos from LinkedIn or YouTube
- a side-projects section with short technical write-ups
- Azure Functions for small dynamic features
- Cosmos DB for learning-oriented backend experiments
- utility tools on subdomains, for example a unit price calculator

## Deployment

The intended deployment flow is:

1. Make changes locally.
2. Commit and push to GitHub.
3. Let Cloudflare Pages deploy automatically.
4. Use the custom domain through Cloudflare.

## Content principles

- Clear and professional
- Concise over verbose
- Technical, but still readable by recruiters
- Focus on real work, side projects, and practical learning
- Avoid unnecessary visual complexity in version one

## Notes for future work

This repository may later contain:

- a richer portfolio section
- technical side-project explanations
- architecture notes
- a tools subdomain or related mini-apps

The first milestone is simple: publish a solid personal homepage that represents Patrick Koorevaar well.

## about.md export markers

[about.md](https://blog.koorevaar.com/about.md) is generated from the homepage, so the two can't drift apart. Elements in `public/index.html` that belong in it carry `data-md-*` attributes. The attributes have no styling or behaviour, so they cause no visual change. Export is opt-in: anything unmarked (nav, buttons, chat widget, Turnstile, live counters) is ignored.

| Marker | Where | Becomes |
|---|---|---|
| `data-md-section` + `data-md-title="…"` | a block of content; not nested | `## …` heading |
| `data-md-item` | inside a section; not nested | a `### title` block when it has text, otherwise one `- **title**: meta · tags` bullet |
| `data-md-title` | inside an item, exactly one | the item's title |
| `data-md-meta` | inside an item | status or date line (italic), or the bullet's detail |
| `data-md-text` | in an item or directly in a section | a paragraph; inline `<a>` links are kept as Markdown links |
| `data-md-tag` | inside an item | `Tags:` list |
| `data-md-link` | on an `<a>` with an http(s) href | `[label](url)`; relative hrefs resolve against www.koorevaar.com |
| `data-md-stat` + `data-md-label` / `data-md-value` | directly in a section | `- label: value` |

Stat values must be known at build time, because the counters render as `—` in the raw HTML. Date-based counters are exported as their start date ("In IT since: January 2000") so they never go stale. Live stats (visits, blog articles, questions answered, embeddings) stay unmarked. The document title comes from `<title>`.

`scripts/export_about_md.py` is the reference exporter (Python stdlib only):

```
python3 scripts/export_about_md.py > about.md
```

It fails on invalid markers and on stat values that no longer match the counter scripts (`static-stat-counters.js`, the start dates in `tenure-counter.js` / `ai-dev-counter.js`, and the `[data-project]` count). The **about.md export markers** workflow runs it on every PR that touches the homepage or the counters, and puts the resulting Markdown in the job summary.
