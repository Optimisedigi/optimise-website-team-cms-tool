# Deck Template System

Live-rendered slide decks backed by Payload CMS. No filesystem writes in production.

## Architecture

```
src/lib/decks/
├── types.ts          — Registry types + registerTemplate() / getTemplate() / listTemplates()
├── registry.ts      — Side-effect imports register all known templates
└── templates/
    ├── google-ads-audit-15-slide/
    │   ├── index.ts         — registerTemplate({ kind: 'live', ... })
    │   ├── Component.tsx    — React component: (props: { payload: T }) => JSX
    │   └── payload.ts       — Zod schema + full sample payload
    └── stakeholder-recap-5-slide/
        └── …
```

## API for agents

```ts
import { getTemplate, listTemplates } from '@/lib/decks/registry';

// Get one template by slug (undefined if unknown)
const t = getTemplate('google-ads-audit-15-slide');
// t: { slug, name, description, payloadSchema, samplePayload, Component, kind }

// List all registered templates
listTemplates().forEach(t => console.log(t.slug, t.name));

// Validate arbitrary JSON against a template's schema
const result = t.payloadSchema.safeParse(rawJson);
// → { ok: true, value: TPayload }  |  { ok: false, error: string }
```

## Adding a new template

1. **Create the directory** — `src/lib/decks/templates/<new-slug>/`
2. **`payload.ts`** — Define `TPayload` type + Zod schema + `samplePayload`
3. **`Component.tsx`** — Server component: `(props: { payload: TPayload }) => JSX`
4. **`index.ts`** — Import `registerTemplate` from `../types`, export the call:

   ```ts
   import { registerTemplate } from '../../types';
   import { Component } from './Component';
   import { payloadSchema, samplePayload } from './payload';

   registerTemplate({
     kind: 'live',
     slug: 'my-new-template',
     name: 'My New Template',
     description: 'What it does',
     payloadSchema,
     samplePayload,
     Component,
   });
   ```

5. **Register** — Add side-effect import to `src/lib/decks/registry.ts`:

   ```ts
   import './templates/my-new-template';
   ```

6. **Create CMS row** — In Payload admin, create a `deck-templates` entry with matching `templateSlug`
7. **Test** — `GET /partners/_preview/my-new-template/` (requires admin sign-in)

## Routing

| URL | Access | Description |
|-----|--------|-------------|
| `/partners/_preview/<slug>/` | Admin auth required | Renders template with `samplePayload` |
| `/partners/<clientSlug>/<deckSlug>/` | PIN-gated (client-facing) | Fetches `deckPayload` from client record and renders live |

## Data model

**`deck-templates` collection (Payload)**
- `templateSlug` — must match a registered slug in `registry.ts`
- `name`, `description`, `category`
- `previewUrl` / `usage` — admin UI components (`DeckTemplatePreviewLink`, `DeckTemplateUsageCount`)

**`clients.presentations[]` (embedded array)**
- `deckSlug` — unique-per-client identifier in the URL
- `templateSlug` — relationship to `deck-templates`
- `deckPayload` — JSON blob validated against the template's `payloadSchema` at render time

## Rules

- Templates are **append-only** — a breaking schema change requires a new slug (e.g. `my-slug-v2`), never overwriting an existing one.
- The registry throws at startup if two templates share a slug.
- Only `kind: 'live'` templates are supported. The `kind: 'file'` variant (local-dev file emission) is deprecated.
