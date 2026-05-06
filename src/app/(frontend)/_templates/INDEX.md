# Templates Registry

Canonical list of UI / page / deck templates available to the Optimate agent fleet and to any team member building a new client artifact. Each entry points at the template folder; clone the folder, rename, and populate with the relevant client data.

## Why this file exists

When an agent (or a person) needs to produce a client-facing artifact (deck, audit page, proposal page, etc.), they should consult this index first to pick the right template, rather than re-implementing the layout. New templates MUST be added here when introduced. The accompanying build-plan reference is in `drafts/optimate-agent-build-plan.md` under the "Templates Master List" section.

## Conventions

- Folder lives at `src/app/(frontend)/_templates/<slug>/`. The leading underscore tells Next.js the folder is private, so templates never publish as live routes.
- Every template folder must contain at minimum: the relevant React/TSX file (e.g. `page.tsx`), any per-template CSS (e.g. `globals.css`), and a `README.md` describing structure, sections, conventions, and how to clone for a new client instance.
- Slug is kebab-case and describes the artifact, not the client.

## Available templates

| Slug | Folder | Type | Use when | Reference live instance |
|---|---|---|---|---|
| `post-build-optimisation-qbr` | `_templates/post-build-optimisation-qbr/` | Slide deck (web + PDF) | Quarterly Business Review or post-build-optimisation review with a client. Covers historical traffic, what was shipped, conversion mix, optimisations, tracking, 90-day target. | `partners/google-ads-audit/team-session-may-2026/` |

## How agents should use templates

1. Read this `INDEX.md` to find the template slug that matches the requested artifact.
2. Read the template's `README.md` to understand the structure and required input data.
3. Clone the template folder to a target path (typically `partners/<area>/<client-slug>-<period>/`).
4. Populate the template with real data drawn from CMS collections, Google Ads, GA4, and any client-supplied source. Do NOT invent numbers.
5. Run a local preview (`npm run dev`, port 3004) and compare against the live reference instance for layout regressions before shipping.
6. Surface the change for human approval through the agent_recommendations queue (per the build plan) before committing.

## Adding a new template

1. Create `src/app/(frontend)/_templates/<slug>/`.
2. Add the template files + `README.md`.
3. Add a row to the table above.
4. Update the "Already built ✅" list in `drafts/optimate-agent-build-plan.md`.
5. Commit and push.
