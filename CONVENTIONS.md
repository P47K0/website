# CONVENTIONS.md

This file defines the conventions for generating and editing this project.

## Project purpose

This repository powers `koorevaar.com`, a personal website for Patrick Koorevaar.

The first version should be a simple and professional static CV / portfolio site. It should launch quickly and be easy to maintain. Later versions may add side projects, embedded demo videos, and small cloud-backed features.

## Main goals

- Keep version one simple.
- Prefer static site approaches over heavy app architecture.
- Make the site look modern, clean, and professional.
- Use a responsive layout that works well on mobile and desktop.
- Keep the code easy to understand and easy to edit.

## Technical constraints

- Use a static site.
- Use Bootstrap for layout and responsive structure.
- Use plain HTML, CSS, and light JavaScript only when needed.
- Avoid build tools unless there is a very clear reason.
- Avoid unnecessary frameworks for version one.
- Keep external dependencies minimal.
- Make the site work well with GitHub + Cloudflare Pages deployment.

## Design direction

The design should feel:

- professional
- modern
- lightweight
- practical
- personal but not flashy

Avoid template-like “AI slop” aesthetics.

Do not use:

- excessive gradients
- glowing effects
- overly playful animations
- crowded dashboards
- generic startup marketing language

Prefer:

- good spacing
- readable typography
- simple sections
- clear hierarchy
- subtle visual polish

## Content structure

The main page should be a one-page site with sections like:

1. Hero / introduction
2. About
3. Experience summary
4. Skills
5. Selected projects
6. Links / contact
7. CV download

Future optional sections:

- side projects
- embedded demo videos
- notes about modern development workflow
- tools or utilities

## Writing style

The tone should be:

- clear
- grounded
- technical
- confident without sounding exaggerated

Avoid:

- buzzword-heavy writing
- vague claims
- inflated self-marketing
- long dense paragraphs

Prefer:

- short paragraphs
- concrete descriptions
- real technologies and real outcomes
- practical wording

## Branding and positioning

The site should present Patrick Koorevaar as:

- DevOps Engineer
- experienced with Azure, AKS, CI/CD, Kubernetes, and infrastructure automation
- someone who builds side projects to learn and validate ideas
- someone who uses modern tooling pragmatically

The site should separate:

- professional identity on the main domain
- experiments, demos, or tools in clearly separate sections or subdomains

## Code conventions

- Keep HTML semantic where possible.
- Keep CSS organized and readable.
- Prefer small reusable class patterns.
- Avoid large JavaScript files unless functionality requires it.
- Comment only where comments add real value.
- Use descriptive file and section names.

## Bootstrap usage

Bootstrap should mainly be used for:

- grid/layout
- spacing utilities
- responsive behavior
- simple components when useful

Do not rely entirely on default Bootstrap styling.
Add a light custom style layer so the site feels personal and not like a stock template.

## Performance and UX

- Keep the site fast.
- Keep the page small.
- Make mobile layout a first-class concern.
- Avoid heavy assets in version one.
- Use embedded video later rather than self-hosting large media files by default.

## Deployment assumptions

Assume this project will be:

- stored in GitHub
- deployed via Cloudflare Pages
- served behind Cloudflare on `koorevaar.com`

Cloudflare is the public edge layer. Future backends or other endpoints may sit behind it.

## File structure

- All public website files must live in `public/`.
- Place the main homepage at `public/index.html`.
- Place custom styles in `public/styles.css`.
- Place images and other assets in `public/assets/`.
- Keep project documentation files like `README.md`, `CONVENTIONS.md`, and `content.md` in the repo root.
- Do not place served website files in the repo root unless explicitly requested.

## Future-friendly architecture

The structure should leave room for later additions such as:

- Azure Functions
- Cosmos DB experiments
- utility tools on subdomains
- demo/project embeds
- richer project pages

Do not overbuild these now. Just keep the structure clean enough that they can be added later.

## What to optimize for

When making implementation decisions, optimize for:

1. simplicity
2. clarity
3. speed of shipping
4. maintainability
5. professional presentation

## What not to optimize for yet

Do not optimize for:

- complex app architecture
- advanced backend logic
- heavy animation
- perfect abstraction
- too many pages
- enterprise-scale structure

Version one should be small, credible, and live quickly.
