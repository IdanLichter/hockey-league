// Single source of truth for the league's brand color outside of CSS.
// Anything that needs a literal hex (canvas poster rendering, inline `style`
// fallbacks, SVG icon fills) imports from here instead of retyping the value.
// Keep in sync with --brand / --brand-hover in src/index.css.
export const BRAND_COLOR = '#3B4FC4'        // royal blue — matches --brand
export const BRAND_COLOR_HOVER = '#2E3EA8'  // darker press — matches --brand-hover

// Back-compat aliases: the constants keep their historical "ORANGE" name so the
// ~6 importers don't churn, but both now resolve to the current royal-blue brand
// (the app was re-skinned from orange to the "Rink" navy/blue palette).
export const BRAND_ORANGE = BRAND_COLOR
export const BRAND_ORANGE_HOVER = BRAND_COLOR_HOVER
