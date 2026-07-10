// Single source of truth for the league's brand color outside of CSS.
// Anything that needs a literal hex (canvas poster rendering, inline `style`
// fallbacks, SVG icon fills) imports from here instead of retyping the value.
// Keep in sync with --brand / --brand-hover in src/index.css.
export const BRAND_ORANGE = '#f97316'       // orange-500
export const BRAND_ORANGE_HOVER = '#ea580c' // orange-600
