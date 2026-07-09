import { supabase } from './supabase'

/**
 * Judge live-scoring persistence (Pkg2). A single SECURITY DEFINER RPC does the
 * whole "finish game" atomically — gated server-side to admins or judge-role
 * users, blocks re-scoring a completed game, replaces the box score, sets the
 * final score + status, and recomputes both teams' standings. See
 * scratchpad/judge_pkg2_up.sql / migration `judge_pkg2_live_scoring`.
 *
 * @param {string} gameId
 * @param {number} homeScore
 * @param {number} awayScore
 * @param {Array<{player_id:string, goals:number, blue_cards:number, red_cards:number, clean_sheet:boolean}>} stats
 */
export async function saveGameResult(gameId, homeScore, awayScore, stats) {
  const { error } = await supabase.rpc('judge_save_game_result', {
    p_game_id: gameId,
    p_home_score: homeScore,
    p_away_score: awayScore,
    p_stats: stats,
  })
  if (error) throw error
}
