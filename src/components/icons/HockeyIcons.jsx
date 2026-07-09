// Custom rink-hockey line icons — drop-in compatible with lucide-react usage.
// Same 24×24 grid, 2px stroke, `currentColor` so `text-*` classes tint them.
// The orange faceoff accent (ball / dot) is the family signature; pass `mono`
// to make that accent `currentColor` too (needed on solid-orange backgrounds
// like the active nav item, where a fixed orange dot would disappear).
const O = "#f97316"

function Svg({ children, className = "w-6 h-6", strokeWidth = 2, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

// A rink-hockey stick (straight shaft + flat J-hook blade) with the ball.
export function StickBall({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <path d="M17 4.5 L9.4 14.6" />
      <path d="M9.4 14.6 C 8.3 16.4, 8.7 18.6, 11 18.9 L 12.4 19" />
      <circle cx="15" cy="19.4" r="1.7" fill={a} stroke="none" />
    </Svg>
  )
}

// A hockey goal: frame + net, ball tucked in the top corner.
export function Goal({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <path d="M4 7.5 H20 V19 M4 7.5 V19" />
      <path d="M4 12 H20 M4 15.5 H20" opacity="0.35" />
      <path d="M9.3 7.5 V19 M14.7 7.5 V19" opacity="0.35" />
      <circle cx="17" cy="10" r="2" fill={a} stroke="none" />
    </Svg>
  )
}

// A referee whistle with an orange pea.
export function Whistle({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <path d="M3 11 H10.5 a4 4 0 1 1 -3.4 4 H3 a1 1 0 0 1 -1 -1 v-2 a1 1 0 0 1 1 -1 Z" />
      <path d="M6 11 V9 H9.2" />
      <circle cx="11" cy="14" r="1.6" fill={a} stroke="none" />
    </Svg>
  )
}

// Two penalty cards — blue + red (the real card colors; semantic, so unaffected by mono).
export function Cards(props) {
  return (
    <Svg {...props}>
      <g transform="rotate(-9 9 12)">
        <rect x="5.5" y="6" width="7" height="12.5" rx="1.4" fill="#38bdf8" stroke="none" />
      </g>
      <g transform="rotate(9 15 12)">
        <rect x="11.5" y="6" width="7" height="12.5" rx="1.4" fill="#ef4444" stroke="none" />
      </g>
    </Svg>
  )
}

// A single penalty card (tilted), blue or red.
export function BlueCard(props) {
  return (
    <Svg {...props}>
      <g transform="rotate(-7 12 12)">
        <rect x="7.5" y="4.5" width="9" height="15" rx="1.6" fill="#38bdf8" stroke="none" />
      </g>
    </Svg>
  )
}
export function RedCard(props) {
  return (
    <Svg {...props}>
      <g transform="rotate(-7 12 12)">
        <rect x="7.5" y="4.5" width="9" height="15" rx="1.6" fill="#ef4444" stroke="none" />
      </g>
    </Svg>
  )
}

// A goalie glove catching the ball (clean sheet / goalkeeper).
export function Glove({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <path d="M8 20 V11 a4 4 0 0 1 8 0 V20 Z" />
      <path d="M8 14.5 H16" opacity="0.35" />
      <circle cx="12" cy="8.4" r="2" fill={a} stroke="none" />
    </Svg>
  )
}

// Crossed sticks over the ball — matchup / games.
export function Crossed({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <path d="M5 5 C 8 9, 10 13, 10.5 18" />
      <path d="M19 5 C 16 9, 14 13, 13.5 18" />
      <path d="M8 18.5 C 9 20, 15 20, 16 18.5" />
      <circle cx="12" cy="18.5" r="1.7" fill={a} stroke="none" />
    </Svg>
  )
}

// A quad skate (boot + two wheel-pairs).
export function Skate({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <path d="M4 6 V13 h8.5 a4 4 0 0 1 3.7 2.4 L16.5 16 H4.6 a0.6 0.6 0 0 1 -0.6 -0.6 Z" />
      <path d="M4 13 h8.5" opacity="0.35" />
      <path d="M7 16 V17.6 M15 16 V17.6" />
      <circle cx="5.6" cy="19.2" r="1.7" />
      <circle cx="8.4" cy="19.2" r="1.7" />
      <circle cx="13.6" cy="19.2" r="1.7" />
      <circle cx="16.4" cy="19.2" r="1.7" />
      <circle cx="6.2" cy="9" r="1.3" fill={a} stroke="none" />
    </Svg>
  )
}

// A skating player with the ball.
export function Player({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <circle cx="8.6" cy="4.4" r="2.15" />
      <path d="M8.6 6.5 C 9.4 8.6, 10.2 10.6, 11 12.3" />
      <path d="M11 12.3 C 9.6 14.4, 8.4 16.4, 7.4 18.6" />
      <path d="M11 12.3 C 12.4 14, 13.4 15.8, 14.2 17.8" />
      <path d="M9.3 8.2 C 10.8 9.2, 12.2 10, 13.4 10.8" />
      <path d="M12.7 10.3 C 15.2 12.6, 17.4 15, 18.8 17.2" />
      <circle cx="19.9" cy="18" r="1.6" fill={a} stroke="none" />
    </Svg>
  )
}

// The league table with a leader spot.
export function Standings({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.3 H20.5 M3.5 14.3 H20.5" />
      <circle cx="17" cy="7" r="1.6" fill={a} stroke="none" />
    </Svg>
  )
}

// The rink from above — "המגרש" (the court): boards, center line, faceoff circle, goals.
export function Rink({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="3.2" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="0.9" fill={a} stroke="none" />
      <path d="M2.5 9.8 h1.9 v4.4 h-1.9" />
      <path d="M21.5 9.8 h-1.9 v4.4 h1.9" />
    </Svg>
  )
}

// Two team crests.
export function Teams({ mono, ...props }) {
  const a = mono ? "currentColor" : O
  return (
    <Svg {...props}>
      <path d="M8.5 4.6 C 6 5, 6 6.5, 6 8 C 6 10.6, 8.5 12, 8.5 12 C 8.5 12, 11 10.6, 11 8 C 11 6.5, 11 5, 8.5 4.6 Z" />
      <path d="M15.5 7.6 C 13 8, 13 9.5, 13 11 C 13 13.6, 15.5 15, 15.5 15 C 15.5 15, 18 13.6, 18 11 C 18 9.5, 18 8, 15.5 7.6 Z" />
      <circle cx="15.5" cy="10.6" r="1.5" fill={a} stroke="none" />
    </Svg>
  )
}
