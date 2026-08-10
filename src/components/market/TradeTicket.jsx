import { useState, useMemo, useEffect } from 'react'
import { Loader2, ArrowLeftRight, Lock, TrendingUp, TrendingDown } from 'lucide-react'
import {
  prices, sharesForCoins, coinsForShares, avgPrice, pct, coins as fmtCoins, buy, sell,
} from '@/lib/market'
import { OutcomeFace } from './MarketCard'

const QUICK = [25, 50, 100, 250]

/**
 * Buy and sell one outcome.
 *
 * Every figure updates on the keystroke, priced by the same LMSR curve the server
 * runs — so the quote a trader accepts is the quote they get. The two numbers
 * that matter are shown without being asked for: the average price this stake
 * actually pays (not the screen price, which is only the price of the very first
 * share) and the payout if it lands. Slippage is the thing an AMM hides from you
 * if you let it.
 */
export default function TradeTicket({ market, balance, position, onTraded }) {
  const [side, setSide] = useState('buy')
  const [selected, setSelected] = useState(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)

  const tradable = market.status === 'open'
  const outcomes = useMemo(
    () => [...market.outcomes].sort((a, b) => b.price - a.price),
    [market.outcomes]
  )

  // Default to the favourite, and keep the selection valid across refreshes.
  useEffect(() => {
    if (!selected || !market.outcomes.some(o => o.id === selected)) {
      setSelected(outcomes[0]?.id ?? null)
    }
  }, [market.id, outcomes, selected, market.outcomes])

  const idx = market.outcomes.findIndex(o => o.id === selected)
  const outcome = idx >= 0 ? market.outcomes[idx] : null
  const held = Number(position?.[selected]?.shares || 0)
  const b = Number(market.b)
  const qs = market.outcomes.map(o => Number(o.q))

  const preview = useMemo(() => {
    const n = Number(amount)
    if (!outcome || !(n > 0)) return null
    if (side === 'buy') {
      const shares = sharesForCoins(qs, b, idx, n)
      if (!(shares > 0)) return null
      const after = qs.slice(); after[idx] += shares
      return {
        shares,
        avg: avgPrice(n, shares),
        payout: shares,
        profit: shares - n,
        newPrice: prices(after, b)[idx],
      }
    }
    const shares = Math.min(n, held)
    if (!(shares > 0)) return null
    const proceeds = coinsForShares(qs, b, idx, shares)
    const after = qs.slice(); after[idx] -= shares
    return {
      shares, proceeds, avg: avgPrice(proceeds, shares), newPrice: prices(after, b)[idx],
    }
  }, [amount, side, idx, held, b, qs, outcome])

  const overBalance = side === 'buy' && Number(amount) > Number(balance)
  const overHolding = side === 'sell' && Number(amount) > held

  const submit = async (e) => {
    e.preventDefault()
    if (!outcome || !preview || busy) return
    setBusy(true); setErr(null); setDone(null)
    try {
      const n = Number(amount)
      const r = side === 'buy'
        ? await buy(outcome.id, n)
        : await sell(outcome.id, Math.min(n, held))
      setDone(side === 'buy'
        ? `נקנו ${Number(r.shares).toFixed(1)} מניות`
        : `התקבלו ${fmtCoins(r.coins)} מטבעות`)
      setAmount('')
      await onTraded?.()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mkt-card p-4 sticky top-20">
      {/* Outcome picker */}
      <div className="space-y-1.5 mb-4">
        {outcomes.map(o => {
          const mine = Number(position?.[o.id]?.shares || 0)
          const active = o.id === selected
          return (
            <button
              key={o.id} type="button" onClick={() => { setSelected(o.id); setErr(null); setDone(null) }}
              className={`mkt-bar w-full flex items-center gap-2 px-2.5 py-2 text-start transition-shadow ${
                active ? 'ring-2 ring-brand' : 'hover:ring-1 hover:ring-line-strong'
              }`}
            >
              <div className="mkt-bar-fill" style={{ width: `${Math.round(o.price * 100)}%` }} />
              <div className="relative flex items-center gap-2 min-w-0 flex-1">
                <OutcomeFace outcome={o} size={6} />
                <span className="text-[13px] font-semibold text-fg-soft truncate">{o.label}</span>
                {mine > 0 && (
                  <span className="stat-pill bg-brand/15 text-brand text-[10px] px-1.5 py-0 shrink-0 mkt-num">
                    {mine.toFixed(0)}
                  </span>
                )}
              </div>
              <span className="relative mkt-num text-sm font-bold text-fg-strong shrink-0">{pct(o.price)}</span>
            </button>
          )
        })}
      </div>

      {!tradable ? (
        <div className="flex items-center gap-2 justify-center py-4 text-sm text-fg-muted">
          <Lock className="w-4 h-4" />
          {market.status === 'resolved' ? 'השוק הוכרע' :
           market.status === 'void' ? 'השוק בוטל וההימורים הוחזרו' : 'המסחר נסגר'}
        </div>
      ) : (
        <form onSubmit={submit}>
          {/* Buy / sell */}
          <div className="tab-bar mb-3">
            <button type="button" onClick={() => { setSide('buy'); setAmount(''); setErr(null) }}
              className={side === 'buy' ? 'tab-active' : 'tab-inactive'}>
              <TrendingUp className="w-3.5 h-3.5" /> קנייה
            </button>
            <button type="button" onClick={() => { setSide('sell'); setAmount(''); setErr(null) }}
              disabled={held <= 0}
              className={`${side === 'sell' ? 'tab-active' : 'tab-inactive'} disabled:opacity-40 disabled:cursor-not-allowed`}>
              <TrendingDown className="w-3.5 h-3.5" /> מכירה
            </button>
          </div>

          <label className="block mb-2">
            <span className="flex items-center justify-between text-xs font-semibold text-fg-muted mb-1.5">
              <span>{side === 'buy' ? 'סכום במטבעות' : 'כמות מניות'}</span>
              <span className="mkt-num">
                {side === 'buy'
                  ? `יתרה ${fmtCoins(balance)}`
                  : `מחזיק ${held.toFixed(1)}`}
              </span>
            </span>
            <input
              type="number" inputMode="decimal" min="0" step="any" dir="ltr"
              value={amount} onChange={e => { setAmount(e.target.value); setErr(null); setDone(null) }}
              placeholder="0"
              className="w-full bg-surface-inset border border-line rounded-lg px-3 py-2.5 mkt-num text-lg font-bold text-fg-strong focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </label>

          <div className="flex gap-1.5 mb-3">
            {side === 'buy'
              ? QUICK.map(v => (
                  <button key={v} type="button" onClick={() => setAmount(String(v))}
                    disabled={v > Number(balance)}
                    className="flex-1 py-1.5 rounded-lg bg-surface-sunken text-fg-muted mkt-num text-xs font-bold hover:text-brand transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    {v}
                  </button>
                ))
              : [0.25, 0.5, 1].map(f => (
                  <button key={f} type="button" onClick={() => setAmount(String(+(held * f).toFixed(6)))}
                    className="flex-1 py-1.5 rounded-lg bg-surface-sunken text-fg-muted mkt-num text-xs font-bold hover:text-brand transition-colors">
                    {f === 1 ? 'הכל' : `${f * 100}%`}
                  </button>
                ))}
          </div>

          {preview && (
            <dl className="space-y-1.5 mb-3 px-3 py-2.5 rounded-lg bg-surface-inset text-xs">
              {side === 'buy' ? (
                <>
                  <Row label="מניות" value={preview.shares.toFixed(1)} />
                  <Row label="מחיר ממוצע" value={pct(preview.avg)} />
                  <Row label="אם זה יקרה" value={fmtCoins(preview.payout)} accent />
                  <Row label="רווח" value={`+${fmtCoins(preview.profit)}`} accent />
                </>
              ) : (
                <>
                  <Row label="תקבל" value={fmtCoins(preview.proceeds)} accent />
                  <Row label="מחיר ממוצע" value={pct(preview.avg)} />
                </>
              )}
              <Row label="מחיר אחרי" value={`${pct(outcome.price)} ← ${pct(preview.newPrice)}`} />
            </dl>
          )}

          {overBalance && <p className="text-xs text-neg mb-2">אין לך מספיק מטבעות</p>}
          {overHolding && <p className="text-xs text-neg mb-2">אין לך מספיק מניות</p>}
          {err && <p className="text-xs text-neg mb-2">{err}</p>}
          {done && <p className="text-xs text-brand font-semibold mb-2">{done}</p>}

          <button type="submit"
            disabled={busy || !preview || overBalance || overHolding}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
            {side === 'buy' ? 'קנייה' : 'מכירה'}
          </button>
        </form>
      )}
    </div>
  )
}

function Row({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={`mkt-num font-bold ${accent ? 'text-brand' : 'text-fg-soft'}`} dir="ltr">{value}</dd>
    </div>
  )
}
