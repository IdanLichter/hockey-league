import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Standings tiebreakers: points desc, then goal difference desc, then goals for desc.
export function standingsComparator(a, b) {
  const points = (b.points || 0) - (a.points || 0)
  if (points !== 0) return points
  const diffA = (a.goals_for || 0) - (a.goals_against || 0)
  const diffB = (b.goals_for || 0) - (b.goals_against || 0)
  if (diffB !== diffA) return diffB - diffA
  return (b.goals_for || 0) - (a.goals_for || 0)
}
