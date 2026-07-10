import { Link } from "react-router-dom"

/**
 * Links that degrade to inert text when there is no id to link to.
 *
 * This is the guest-player / unpaired-author case: game_stats rows can carry a
 * `guest_player_name` with a null player_id, and those people have no page.
 * Extracted from FeedPost.jsx, where both were module-local.
 */

export function TeamLink({ team, className = "", children }) {
  if (!team?.id) return <span className={className}>{children}</span>
  return <Link to={`/teams/${team.id}`} className={className}>{children}</Link>
}

export function PlayerLink({ playerId, className = "", children }) {
  if (!playerId) return <span className={className}>{children}</span>
  return <Link to={`/players/${playerId}`} className={className}>{children}</Link>
}
