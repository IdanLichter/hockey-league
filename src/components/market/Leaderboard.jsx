import { useState, useEffect } from 'react'
import { Trophy, Loader2 } from 'lucide-react'
import { getLeaderboard, coins as fmtCoins, START_BALANCE } from '@/lib/market'
import { useAuth } from '@/lib/AuthContext'

function Face({ name, url }) {
  if (url) {
    return <img src={url} alt="" loading="lazy"
      onError={e => { e.currentTarget.style.visibility = 'hidden' }}
      className="w-8 h-8 rounded-full object-cover shrink-0 bg-surface-sunken" />
  }
  return (
    <div className="w-8 h-8 rounded-full shrink-0 bg-surface-sunken flex items-center justify-center text-xs font-bold text-fg-muted">
      {name?.charAt(0) || '?'}
    </div>
  )
}

const MEDAL = ['text-gold', 'text-fg-subtle', 'text-[#b87333]']

/**
 * Ranked by net worth, not by cash. Someone who has moved 900 of their 1,000
 * coins into a position they are winning is doing well, and a cash-only table
 * would rank them last.
 */
export default function Leaderboard() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    getLeaderboard().then(setRows).catch(() => setErr(true))
  }, [])

  if (err) return <p className="text-center text-sm text-fg-muted py-10">לא הצלחנו לטעון את הטבלה</p>
  if (!rows) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>
  }
  if (!rows.length) {
    return <p className="text-center text-sm text-fg-muted py-10">עדיין אף אחד לא נכנס לשוק</p>
  }

  return (
    <div className="mkt-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line-subtle">
        <Trophy className="w-4 h-4 text-gold" />
        <h2 className="font-extrabold text-fg-strong text-sm">טבלת המובילים</h2>
        <span className="ms-auto text-[11px] text-fg-subtle">שווי תיק = מטבעות + פוזיציות פתוחות</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-fg-subtle border-b border-line-subtle">
              <th className="text-start font-semibold px-4 py-2 w-10">#</th>
              <th className="text-start font-semibold px-2 py-2">שחקן</th>
              <th className="text-end font-semibold px-2 py-2">מטבעות</th>
              <th className="text-end font-semibold px-2 py-2 hidden sm:table-cell">פוזיציות</th>
              <th className="text-end font-semibold px-4 py-2">שווי תיק</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows.map((r, i) => {
              const me = r.user_id === user?.id
              const up = Number(r.total) >= START_BALANCE
              return (
                <tr key={r.user_id} className={me ? 'bg-brand/5' : undefined}>
                  <td className={`px-4 py-2.5 mkt-num font-bold ${MEDAL[i] || 'text-fg-subtle'}`}>{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Face name={r.display_name} url={r.avatar_url} />
                      <span className="font-semibold text-fg-strong truncate">{r.display_name}</span>
                      {me && <span className="stat-pill bg-brand/15 text-brand text-[10px] px-1.5 py-0">אני</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-end mkt-num text-fg-soft">{fmtCoins(r.balance)}</td>
                  <td className="px-2 py-2.5 text-end mkt-num text-fg-muted hidden sm:table-cell">
                    {fmtCoins(r.open_value)}
                  </td>
                  <td className={`px-4 py-2.5 text-end mkt-num font-bold ${up ? 'text-pos' : 'text-neg'}`}>
                    {fmtCoins(r.total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
