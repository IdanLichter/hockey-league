import { Shield, Gavel, PenSquare, ClipboardList, BadgeCheck, UserCircle } from "lucide-react"

// Single source of truth for how a league role renders as a badge, so /me, the
// player page and feed post authors all show the same label/icon/color per role.
// Labels mirror ROLE_LABEL in src/lib/roles.js (kept human here for the UI).
export const ROLE_BADGE = {
  admin:          { label: "מנהל",      icon: Shield,        cls: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
  judge:          { label: "שופט",      icon: Gavel,         cls: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
  coach:          { label: "מאמן",      icon: ClipboardList, cls: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" },
  content_editor: { label: "עורך תוכן", icon: PenSquare,     cls: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400" },
  player:         { label: "שחקן/ית",   icon: BadgeCheck,    cls: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" },
  guest:          { label: "אורח/ת",    icon: UserCircle,    cls: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
}

// The order badges appear in when a user holds several roles.
const ORDER = ["admin", "judge", "coach", "content_editor", "player", "guest"]

/**
 * Turn a set of role signals into a de-duplicated, ordered list of badge items.
 * `roles` is an array of user_roles rows ({ role, team_id }) or plain role strings.
 * `isAdmin` / `isPlayer` are the out-of-band signals (admin lives in admin_users;
 * "player" comes from a profiles↔players link, not a user_roles row).
 * Pass `teamsMap` to append a coach's team name; pass `guestFallback` to show
 * "אורח/ת" when the user holds no role at all.
 */
export function deriveRoleItems({ roles = [], isAdmin = false, isPlayer = false, teamsMap = null, guestFallback = false } = {}) {
  // Admin supersedes every granted role (admin already implies judge/coach/editor
  // powers), so an admin shows only the "מנהל" badge.
  if (isAdmin) return [{ role: "admin", team: null }]
  const items = []
  const seen = new Set()
  const push = (role, team_id) => {
    if (!ROLE_BADGE[role] || seen.has(role)) return
    seen.add(role)
    const team = team_id && teamsMap ? (teamsMap[team_id]?.name || null) : null
    items.push({ role, team })
  }
  for (const r of roles) {
    const role = typeof r === "string" ? r : r?.role
    const team_id = typeof r === "string" ? null : r?.team_id
    if (role) push(role, team_id)
  }
  if (isPlayer) push("player")
  if (guestFallback && items.length === 0) push("guest")
  return items.sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role))
}

// One badge pill. `size="sm"` is the compact variant used inline next to a name.
export function RoleBadge({ role, team, size = "md", className = "" }) {
  const def = ROLE_BADGE[role]
  if (!def) return null
  const Icon = def.icon
  const sizeCls = size === "sm"
    ? "text-[10px] px-1.5 py-0.5 gap-0.5 rounded-full font-bold"
    : "stat-pill"
  const iconCls = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"
  return (
    <span className={`inline-flex items-center shrink-0 ${sizeCls} ${def.cls} ${className}`}>
      <Icon className={iconCls} aria-hidden="true" />
      {def.label}{team ? ` · ${team}` : ""}
    </span>
  )
}

// A row of badges built from derived items.
export function RoleBadges({ items = [], size = "md", className = "" }) {
  if (!items.length) return null
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {items.map((it) => (
        <RoleBadge key={it.role} role={it.role} team={it.team} size={size} />
      ))}
    </div>
  )
}
