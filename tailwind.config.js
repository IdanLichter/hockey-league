/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      // Semantic tokens. Colors are `R G B` triplets in CSS vars (see index.css) so
      // Tailwind can still apply an alpha channel: bg-brand/10, ring-brand/30, ...
      // Use these instead of raw orange-* utilities — changing the league's brand
      // color should be a one-line edit in index.css.
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
          fg: 'rgb(var(--brand-fg) / <alpha-value>)',
          strong: 'rgb(var(--brand-strong) / <alpha-value>)',
          light: 'rgb(var(--brand-light) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
