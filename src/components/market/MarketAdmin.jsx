import { useState, useEffect, useCallback, Fragment } from 'react'
import {
  Loader2, Plus, Minus, RefreshCw, Gavel, Ban, Lock, Unlock, Users, ListChecks, AlertTriangle,
} from 'lucide-react'
import {
  getTraders, adjustCoins, resolveMarket, voidMarket, setMarketStatus,
  syncGameMarkets, coins as fmtCoins, pct, START_BALANCE,
} from '@/lib/market'

/**
 * Manager dashboard, living inside the market rather than in /admin — everything
 * here is about this one system, and the people running it are already standing
 * in it.
 *
 * Settling and voiding both move coins irreversibly across every wallet in the
 * league, so neither is a single click: each opens an explicit confirm step that
 * names what is about to happen.
 */
export default function MarketAdmin({ markets, onChanged }) {
  const [tab, setTab] = useState('traders')
  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        <Pill active={tab === 'traders'} onClick={() => setTab('traders')} icon={Users}>מהמרים</Pill>
        <Pill active={tab === 'markets'} onClick={() => setTab('markets')} icon={ListChecks}>שווקים</Pill>
      </div>
      {tab === 'traders' ? <Traders /> : <Markets markets={markets} onChanged={onChanged} />}
    </div>
  )
}

function Pill({ active, onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        active ? 'bg-brand text-brand-fg' : 'bg-surface-sunken text-fg-muted hover:text-fg-soft'
      }`}>
      <Icon className="w-3.5 h-3.5" />{children}
    </button>
  )
}

// ── Traders ─────────────────────────────────────────────────────────────────

function Traders() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [openFor, setOpenFor] = useState(null)

  const load = useCallback(() => {
    getTraders().then(setRows).catch(e => setErr(e.message))
  }, [])
  useEffect(load, [load])

  if (err) return <p className="text-sm text-neg py-6 text-center">{err}</p>
  if (!rows) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>
  if (!rows.length) return <p className="text-sm text-fg-muted py-10 text-center">עדיין אין מהמרים</p>

  const supply = rows.reduce((a, r) => a + Number(r.total), 0)
  const granted = rows.reduce((a, r) => a + Number(r.granted), 0)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="מהמרים" value={rows.length} />
        <Stat label="סך המטבעות במחזור" value={fmtCoins(supply)} />
        <Stat label="מתוכם הוענקו ידנית" value={fmtCoins(granted)} />
      </div>

      <div className="mkt-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-fg-subtle border-b border-line-subtle">
                <th className="text-start font-semibold px-4 py-2">שחקן</th>
                <th className="text-end font-semibold px-2 py-2">מטבעות</th>
                <th className="text-end font-semibold px-2 py-2 hidden sm:table-cell">פוזיציות</th>
                <th className="text-end font-semibold px-2 py-2">שווי תיק</th>
                <th className="text-end font-semibold px-2 py-2 hidden md:table-cell">עסקאות</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {rows.map(r => (
                // Keyed Fragment, not a bare <> — the row and its expanded
                // adjust panel are two siblings that must reconcile as one item.
                <Fragment key={r.user_id}>
                  <tr>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-fg-strong truncate">{r.display_name}</p>
                      {r.player_name && <p className="text-[11px] text-fg-subtle truncate">{r.player_name}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-end mkt-num text-fg-soft">{fmtCoins(r.balance)}</td>
                    <td className="px-2 py-2.5 text-end mkt-num text-fg-muted hidden sm:table-cell">{fmtCoins(r.open_value)}</td>
                    <td className={`px-2 py-2.5 text-end mkt-num font-bold ${
                      Number(r.total) >= START_BALANCE ? 'text-pos' : 'text-neg'}`}>{fmtCoins(r.total)}</td>
                    <td className="px-2 py-2.5 text-end mkt-num text-fg-muted hidden md:table-cell">{r.trades}</td>
                    <td className="px-4 py-2.5 text-end">
                      <button onClick={() => setOpenFor(openFor === r.user_id ? null : r.user_id)}
                        className="text-[11px] font-bold text-brand hover:underline">מטבעות</button>
                    </td>
                  </tr>
                  {openFor === r.user_id && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 bg-surface-inset">
                        <AdjustForm trader={r} onDone={() => { setOpenFor(null); load() }} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="mkt-card px-3 py-2.5">
      <p className="text-[10px] text-fg-subtle font-semibold">{label}</p>
      <p className="mkt-num font-black text-lg text-fg-strong">{value}</p>
    </div>
  )
}

function AdjustForm({ trader, onDone }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const run = async (sign) => {
    const n = Number(amount)
    if (!(n > 0)) { setErr('צריך סכום חיובי'); return }
    setBusy(true); setErr(null)
    try {
      await adjustCoins(trader.user_id, sign * n, reason.trim() || null)
      onDone()
    } catch (e) { setErr(e.message || 'הפעולה נכשלה') } finally { setBusy(false) }
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <label className="block">
        <span className="text-[10px] text-fg-subtle font-semibold block mb-1">סכום</span>
        <input type="number" min="0" step="1" dir="ltr" value={amount} onChange={e => setAmount(e.target.value)}
          className="w-28 bg-surface border border-line rounded-lg px-2.5 py-1.5 mkt-num text-sm text-fg-strong focus:outline-none focus:ring-2 focus:ring-brand/30" />
      </label>
      <label className="block flex-1 min-w-[140px]">
        <span className="text-[10px] text-fg-subtle font-semibold block mb-1">סיבה (רשות)</span>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="בונוס שבועי"
          className="w-full bg-surface border border-line rounded-lg px-2.5 py-1.5 text-sm text-fg-soft focus:outline-none focus:ring-2 focus:ring-brand/30" />
      </label>
      <button onClick={() => run(1)} disabled={busy}
        className="btn btn-sm bg-pos text-white hover:opacity-90 disabled:opacity-40">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} הוספה
      </button>
      <button onClick={() => run(-1)} disabled={busy}
        className="btn btn-sm bg-neg text-white hover:opacity-90 disabled:opacity-40">
        <Minus className="w-3.5 h-3.5" /> הפחתה
      </button>
      {err && <p className="text-[11px] text-neg w-full">{err}</p>}
    </div>
  )
}

// ── Markets ─────────────────────────────────────────────────────────────────

function Markets({ markets, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const sync = async () => {
    setBusy(true); setMsg(null)
    try {
      const n = await syncGameMarkets()
      setMsg(n > 0 ? `נפתחו ${n} שווקים חדשים` : 'כל המשחקים העתידיים כבר מכוסים')
      await onChanged?.()
    } catch (e) { setMsg(e.message || 'הפעולה נכשלה') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={sync} disabled={busy} className="btn-secondary btn-sm">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          סנכרון שווקי משחקים
        </button>
        {msg && <span className="text-[11px] text-fg-muted">{msg}</span>}
      </div>
      <p className="text-[11px] text-fg-subtle leading-relaxed">
        שווקי משחקים נפתחים ונסגרים אוטומטית לפי לוח המשחקים, ומוכרעים לבד לפי התוצאה
        הסופית. שווקי עונה צריכים הכרעה ידנית כאן.
      </p>
      {markets.map(m => <MarketRow key={m.id} market={m} onChanged={onChanged} />)}
    </div>
  )
}

function MarketRow({ market, onChanged }) {
  const [mode, setMode] = useState(null) // 'resolve' | 'void'
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const settled = market.status === 'resolved' || market.status === 'void'
  const winner = market.outcomes.find(o => o.id === market.resolved_outcome_id)

  const run = async (fn) => {
    setBusy(true); setErr(null)
    try { await fn(); setMode(null); await onChanged?.() }
    catch (e) { setErr(e.message || 'הפעולה נכשלה') } finally { setBusy(false) }
  }

  return (
    <div className="mkt-card p-3.5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-fg-strong truncate">{market.title}</p>
          <p className="text-[11px] text-fg-subtle">
            {market.kind === 'game' ? 'שוק משחק' : 'שוק עונה'} · {market.outcomes.length} אפשרויות ·
            נזילות <span className="mkt-num">{fmtCoins(market.b)}</span>
            {winner && <> · זכה: <span className="text-brand font-semibold">{winner.label}</span></>}
          </p>
        </div>
        <span className={`stat-pill text-[10px] shrink-0 ${
          market.status === 'open' ? 'bg-pos/10 text-pos'
          : market.status === 'resolved' ? 'bg-brand/10 text-brand'
          : 'bg-surface-sunken text-fg-muted'}`}>{
          { open: 'פתוח', closed: 'סגור', resolved: 'הוכרע', void: 'בוטל' }[market.status]
        }</span>
      </div>

      {!settled && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {market.status === 'open' ? (
            <button onClick={() => run(() => setMarketStatus(market.id, 'closed'))} disabled={busy}
              className="btn-secondary btn-sm"><Lock className="w-3 h-3" /> סגירה</button>
          ) : (
            <button onClick={() => run(() => setMarketStatus(market.id, 'open'))} disabled={busy}
              className="btn-secondary btn-sm"><Unlock className="w-3 h-3" /> פתיחה</button>
          )}
          <button onClick={() => { setMode(mode === 'resolve' ? null : 'resolve'); setErr(null) }}
            className="btn-secondary btn-sm"><Gavel className="w-3 h-3" /> הכרעה</button>
          <button onClick={() => { setMode(mode === 'void' ? null : 'void'); setErr(null) }}
            className="btn-secondary btn-sm"><Ban className="w-3 h-3" /> ביטול</button>
        </div>
      )}

      {mode === 'resolve' && (
        <div className="mt-3 pt-3 border-t border-line-subtle">
          <p className="flex items-start gap-1.5 text-[11px] text-fg-muted mb-2 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 text-gold shrink-0 mt-px" />
            הכרעה משלמת מיד לכל המחזיקים באפשרות שנבחרה, מטבע לכל מניה. אי אפשר לבטל.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={pick} onChange={e => setPick(e.target.value)}
              className="filter-select flex-1 min-w-[160px] text-xs py-1.5">
              <option value="">בחר את התוצאה שקרתה…</option>
              {[...market.outcomes].sort((a, b) => b.price - a.price).map(o => (
                <option key={o.id} value={o.id}>{o.label} · {pct(o.price)}</option>
              ))}
            </select>
            <button disabled={!pick || busy}
              onClick={() => run(() => resolveMarket(market.id, pick, 'הוכרע ידנית'))}
              className="btn btn-sm bg-brand text-brand-fg disabled:opacity-40">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5" />}
              אישור הכרעה
            </button>
          </div>
        </div>
      )}

      {mode === 'void' && (
        <div className="mt-3 pt-3 border-t border-line-subtle">
          <p className="flex items-start gap-1.5 text-[11px] text-fg-muted mb-2 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 text-gold shrink-0 mt-px" />
            ביטול מחזיר לכל מהמר בדיוק את מה שהשקיע בשוק הזה, כולל קיזוז רווחים שכבר נמשכו.
          </p>
          <button disabled={busy} onClick={() => run(() => voidMarket(market.id, 'בוטל ידנית'))}
            className="btn btn-sm bg-neg text-white disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
            אישור ביטול והחזר
          </button>
        </div>
      )}

      {err && <p className="text-[11px] text-neg mt-2">{err}</p>}
    </div>
  )
}
