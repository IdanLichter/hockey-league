import colors from 'tailwindcss/colors'

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      // ─── Semantic design tokens ──────────────────────────────────────────
      // Every value is a CSS var (`R G B` triplet, see index.css) so Tailwind can
      // still apply an alpha channel: bg-surface/60, text-fg-muted, ring-brand/30.
      // These map 1:1 to the CURRENT slate/orange values, so adopting them changes
      // nothing visually — a future restyle then edits the ~20 vars in index.css once.
      // Use these instead of raw slate-*/orange-* utilities.
      colors: {
        // Brand accent (already wired; kept here as the canonical entry).
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
          fg: 'rgb(var(--brand-fg) / <alpha-value>)',
          strong: 'rgb(var(--brand-strong) / <alpha-value>)',
          light: 'rgb(var(--brand-light) / <alpha-value>)',
        },
        // Surfaces (backgrounds). Three distinct dark values — page/nav/card — must
        // stay separate (collapsing them changes the look).
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',        // card fill: white / slate-800
          page: 'rgb(var(--surface-page) / <alpha-value>)',      // page bg: slate-50 / slate-950
          nav: 'rgb(var(--surface-nav) / <alpha-value>)',        // header + overlay: white / slate-900
          inset: 'rgb(var(--surface-inset) / <alpha-value>)',    // inputs, insets: slate-50 / slate-800
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',  // tab track, ghost hover: slate-100 / slate-800
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',  // active tab: white / slate-700
          chip: 'rgb(var(--surface-chip) / <alpha-value>)',      // neutral chip / VS pill: slate-200 / slate-700
        },
        // Foreground (text). `fg` = body; -strong headings; -soft/-muted/-subtle/-faint
        // descend in emphasis; -inverse stays white in both modes (text on colored fills).
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',             // slate-700 / slate-200
          strong: 'rgb(var(--fg-strong) / <alpha-value>)',       // slate-900 / white
          soft: 'rgb(var(--fg-soft) / <alpha-value>)',           // slate-700 / slate-300
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',         // slate-500 / slate-400
          subtle: 'rgb(var(--fg-subtle) / <alpha-value>)',       // slate-400 / slate-500
          faint: 'rgb(var(--fg-faint) / <alpha-value>)',         // slate-300 / slate-600
          inverse: 'rgb(var(--fg-inverse) / <alpha-value>)',     // white / white
        },
        // Borders + dividers. Header border (slate-200/slate-800) differs from both
        // `line` (slate-200/slate-700) and `line-subtle` (slate-100/slate-800).
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',           // slate-200 / slate-700
          strong: 'rgb(var(--line-strong) / <alpha-value>)',     // slate-200 / slate-600
          subtle: 'rgb(var(--line-subtle) / <alpha-value>)',     // slate-100 / slate-800
          header: 'rgb(var(--line-header) / <alpha-value>)',     // slate-200 / slate-800
        },
        divider: 'rgb(var(--divider) / <alpha-value>)',          // slate-100 / slate-700
        // State / semantic hues — aliased to full Tailwind scales so every shade
        // (bg-success-100, text-success-600, …) keeps working. A restyle repoints
        // the alias. These do NOT flip shade by mode, so keep any `dark:` variant.
        success: colors.emerald,
        danger: colors.red,
        warning: colors.amber,
        info: colors.blue,
        accent: colors.purple,
        // Harmonized supporting tokens (few hues, one family — see index.css).
        pos: 'rgb(var(--pos) / <alpha-value>)',
        neg: 'rgb(var(--neg) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
      },
      // Non-color primitives, aliased to today's exact values so a restyle can round
      // corners / soften shadows / retune type from one place. (Additive — nothing
      // references these until call-sites adopt them.)
      fontSize: {
        '3xs': ['10px', { lineHeight: '1' }],
        '2xs': ['11px', { lineHeight: '1' }],
      },
      borderRadius: {
        card: '1rem',      // rounded-2xl — cards
        control: '0.75rem',// rounded-xl — buttons/panels
        item: '0.5rem',    // rounded-lg — small controls
        chip: '0.375rem',  // rounded-md — chips
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05)',                 // shadow-sm
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', // shadow-md
      },
    },
  },
  plugins: [],
}
