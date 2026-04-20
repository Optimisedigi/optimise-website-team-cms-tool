# Slide UI Tweaks

## Changes Summary

1. **Keyword Analysis (Slide 6)**: Align category name and monthly searches on same row, vertically centered. Remove the border-bottom line under the header.

2. **SEO & CRO Health Score (Slides 10, 8)**: Move the ring gauge circle 20px more to the right (increase `.health-panel-gauge` width by 20px). Make status bars smaller. Move the number inside the ring gauge up 10px. Rename "CRO Health Score" to "Conversion Rate Optimisation Health Score".

3. **CRO Findings (Slide 8)**: Reduce finding font size by 2px, display in two-column layout.

4. **Content Research "Is your website answering these questions" (Slide 13)**: Remove left/right margin on the intro copy so it spans full width.

5. **Mission Control table (Slide 15)**: Make table rows more compact (reduce padding). Move pills/notes directly under the table (reduce margin-top from 200px).

6. **Launch Requirements (Slide 18)**: Move space station right by 3px. Make rocket reach 0% opacity at the very top of scroll.

## Implementation

### File: `src/app/(frontend)/proposals/[slug]/report.css`

**Change 1 — Keyword header alignment:**
- `.kw-category-header`: add `align-items: center` (already set), remove `border-bottom`

**Change 2 — Health Score panel:**
- `.health-panel-gauge`: width 230px → 250px (shift gauge right)
- `.ring-gauge-center`: adjust `transform` to move number up 10px
- `.health-bar-track`: reduce height from 8px to 6px

**Change 3 — CRO Findings two-column:**
- Add `.slide-8 .findings-list` override: two-column grid, smaller font

**Change 4 — Content research intro copy:**
- `.cr-intro-copy`: remove max-width, set to 100%

**Change 5 — Mission Control compact:**
- `.mc-table td`: reduce padding
- `.mc-notes`: reduce margin-top from 200px to 12px

**Change 6 — Launch Requirements:**
- `.slide-18-station`: right 24px → 21px
- `.rocket-fixed`: add opacity rule based on scroll-progress approaching 1

### File: `src/app/(frontend)/proposals/[slug]/page.tsx`

**Change 2b — Rename CRO Health Score title:**
- Line 2134: "CRO Health Score" → "Conversion Rate Optimisation Health Score"
