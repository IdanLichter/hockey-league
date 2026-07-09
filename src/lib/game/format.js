// Formats a millisecond duration into scoreboard components. Ported from
// ClockFormatter.swift.

export function clockParts(ms) {
  const clamped = Math.max(0, ms)
  const totalSeconds = Math.floor(clamped / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths = Math.floor((clamped % 1000) / 100)
  return { minutes, seconds, tenths }
}

const pad = (n) => String(n).padStart(2, '0')

// "MM:SS", or "MM:SS.d" when showTenths is true.
export function clockString(ms, showTenths = false) {
  const p = clockParts(ms)
  const base = `${pad(p.minutes)}:${pad(p.seconds)}`
  return showTenths ? `${base}.${p.tenths}` : base
}
