# Proposal Report Layout Fixes

## Changes

### 1. Keyword Analysis — reduce spacing between category header and table
- File: `src/app/(frontend)/proposals/[slug]/report.css`
- `.kw-category-header` at line 1059: reduce `margin-bottom` from `10px` to `2px` and `padding-bottom` from `8px` to `4px`

### 2. Keyword Analysis — add descriptive copy under the slide header
- File: `src/app/(frontend)/proposals/[slug]/page.tsx` at ~line 2104
- After the slide-header div, add a `<p>` with text like: "These are all the relevant search terms and their monthly search volume in {targetLocationLabel}."
- Uses the existing `targetLocationLabel` variable (line 1013)

### 3. Intro page (slide-1) — client name in blue
- File: `src/app/(frontend)/proposals/[slug]/report.css`
- `.slide-1-business` at line 1782: change `color: #18181b` to `color: #3b82f6`

### 4. Rocket hint — move up 10px and left 5px
- File: `src/app/(frontend)/proposals/[slug]/report.css`
- `.rocket-hint` at line 2688: change `right: 100px` to `right: 105px` and add `+10px` offset to the bottom calc (increase by 10px)

### 5. SEO slide (slide-10) — make compact, move category scores inline
- File: `src/app/(frontend)/proposals/[slug]/page.tsx` at ~line 1757
- Currently: audit-hero (score gauge + summary) then a separate "Category Scores" subsection with score bars
- Desired: single compact section with score gauge on left, category score bars below (no divider header), and a "How each category is scored" link that anchors to an appendix
- Remove the subsection-divider for Category Scores
- Tighten padding/gaps

### 6. CRO slide (slide-8) — same compact treatment
- File: `src/app/(frontend)/proposals/[slug]/page.tsx` at ~line 1904
- Same as SEO: keep audit-hero + sub-scores compact on one page
- Remove the subsection-divider for CRO Sub-Scores
- Move CRO Findings to be more compact or inline

## Steps
1. Reduce `.kw-category-header` spacing in report.css (margin-bottom 2px, padding-bottom 4px)
2. Add keyword analysis intro copy with target location after slide-6 header in page.tsx
3. Change `.slide-1-business` color to `#3b82f6` in report.css
4. Adjust `.rocket-hint` position: right 105px, bottom +10px offset in report.css
5. Compact SEO slide-10: remove Category Scores subsection-divider, reduce audit-hero margin, place score bars directly after hero
6. Compact CRO slide-8: remove CRO Sub-Scores subsection-divider, reduce spacing, keep findings inline
