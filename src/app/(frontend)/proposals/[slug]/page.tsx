/**
 * /proposals/[slug] — serves the v2 deck directly.
 * The v2 page component and metadata are canonical; this file re-exports them
 * so both /proposals/<slug> and /proposals/<slug>/v2 render identically.
 */

export { default, generateMetadata } from './v2/page'
