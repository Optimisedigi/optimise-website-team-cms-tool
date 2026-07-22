# Reusable working-doc review pages

PIN-gated review documents (logo, centered title, jump bar, reviewer input,
Add note / Save buttons, +/× row controls, amber reviewer notes with threaded
replies, autosave + conflict recovery) all render from one component:
`src/components/WorkingDocReviewEditor.tsx`.

## Onboard a new review document

Pick a slug of the form `<clientSlug>/<docName>`. `<clientSlug>` must match an
existing client's `slug`; that client's `clientPin` unlocks the page.

**1. Seed content** — drop the initial markdown at
`src/content/<clientSlug>-<docName>.md`.

**2. Register it** in `src/lib/working-doc-seeds.ts` (single source of truth —
this whitelists the slug for PIN access *and* seeds the first revision):

```ts
export const WORKING_DOC_SEEDS = {
  "cipher/patient-journey-review": { … },
  "acme/onboarding-review": {
    title: "Acme onboarding review",
    seedFile: "acme-onboarding-review.md",
  },
};
```

**3. Add the page** at `src/app/(frontend)/<clientSlug>/<docName>/page.tsx`:

```tsx
import type { Metadata } from "next";
import { WorkingDocReviewEditor } from "@/components/WorkingDocReviewEditor";

export const metadata: Metadata = {
  title: "Acme Onboarding Review | Optimise Digital CMS",
  robots: { index: false, follow: false },
};

export default function AcmeOnboardingReviewPage() {
  return (
    <WorkingDocReviewEditor
      docSlug="acme/onboarding-review"
      title="Onboarding Review"
      subtitle="Shared working document for Acme partners. Edits save automatically after you pause."
      businessName="Acme onboarding review"
    />
  );
}
```

That's it — no edits to the API route. The doc is reachable at
`/<clientSlug>/<docName>`, PIN-gated by the client's `clientPin`.

## Props

| Prop | Required | Purpose |
| --- | --- | --- |
| `docSlug` | yes | `client/doc-name`; drives the API route, PIN lookup, storage keys |
| `title` | yes | Centered heading beside the animated logo |
| `subtitle` | yes | Line under the heading |
| `businessName` | yes | Shown on the PIN gate |
| `featureLabel` | no | PIN gate label (default "Partner Working Document") |
| `reviewerStorageKey` | no | localStorage key for the remembered reviewer name |
| `backupFileName` | no | Filename for the offline/conflict `.md` backup |
