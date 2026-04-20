# Flight Plan Slide: Two-Column Layout with Launch Stack Visual

## Overview

Redesign the Flight Plan slide (slide 16) to have a two-column layout:
- **Left column:** All growth levers as a compact checklist with ✓/✗, title, description, benefit
- **Right column:** A "Launch Stack" visual — vertical rocket stages showing the enabled services as building blocks, with auto-generated narrative copy based on what's selected

Also add 2 new default recommendations: "Social Content Strategy" and "Custom CRM & Lead Management".

## Files to change

- `src/collections/ClientProposals.ts` — add 2 new default recommendations
- `src/app/(frontend)/proposals/[slug]/page.tsx` — rebuild slide 16 with two-column layout + launch stack visual + auto-narrative
- `src/app/(frontend)/proposals/[slug]/report.css` — new CSS for two-column layout, launch stack visual, checklist styling

## Steps

1. Add 2 new default recommendations to `ClientProposals.ts` defaultValue array: "Social Content Strategy" (after Content Strategy & Blog) and "Custom CRM & Lead Management" (after Email Marketing & Automation). Total goes from 12 to 14.

2. Update `page.tsx` slide 16 to use ALL `flightPlanRecommendations` (not just enabled ones) for the left column checklist. Each item shows: ✓ or ✗ icon, title, brief description, and benefit pill. Enabled items are highlighted, disabled ones are dimmed.

3. Build the right column "Launch Stack" visual in `page.tsx`: a vertical stack of "rocket stages" built from enabled recommendations. Foundation services (website, CRO, SEO) at the bottom, growth engines (ads, content) in the middle, measurement (analytics, CRM) at top. Each stage is a colored block with the service name. A small rocket icon sits at the top.

4. Add auto-narrative copy below the launch stack that composes from the selection. Use 3-4 pre-written paragraphs that conditionally render: one for system builds (website+SEO+CRO), one for performance marketing (ads), one for content/social, one for CRM/retention. Plus a universal intro about integrated systems.

5. Add all new CSS: `.flight-plan-layout` (two-column grid), `.flight-plan-checklist` (left column), `.flight-plan-check-item` (individual checklist rows with enabled/disabled states), `.launch-stack` (right column visual), `.launch-stage` (individual stage blocks), `.launch-narrative` (auto-generated text), responsive breakpoint for mobile (stack vertically).

6. Keep existing flight plan content (images, rich text, mockup button) below the new two-column section.
