import TeamLogo from '@/components/TeamLogo'

/**
 * Legend for the multi-series charts. Each item pairs the series colour swatch
 * with the team CREST + NAME — the colour is never the only cue, which is
 * exactly the secondary encoding the dark-mode CVD floor band requires.
 *
 * `items` = [{ id, name, color, team }]
 */
export default function Legend({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
      {items.map((it) => (
        <span key={it.id} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
          <span className="w-3.5 h-1 rounded-full shrink-0" style={{ background: it.color }} aria-hidden="true" />
          <TeamLogo team={it.team} size={5} />
          <span className="whitespace-nowrap">{it.name}</span>
        </span>
      ))}
    </div>
  )
}
