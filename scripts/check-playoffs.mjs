/**
 * Playoff rules harness.  `node scripts/check-playoffs.mjs`
 * Pins src/lib/playoffs.js to the rules the league gave us (2026-09-26).
 */
import assert from 'node:assert/strict'
import { buildPlayoffs, seriesState, leaderClinched, placementTable, ROUND } from '../src/lib/playoffs.js'

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ✓', name) }
const T = (i, pts, gf = 0, ga = 0) => ({ id: `t${i}`, points: pts, goals_for: gf, goals_against: ga })
let gid = 0
const G = (h, a, hs, as, extra = {}) => ({
  id: `g${++gid}`, home_team_id: h, away_team_id: a, home_score: hs, away_score: as,
  status: hs == null ? 'scheduled' : 'completed', game_date: `2027-05-${String(gid).padStart(2, '0')}`,
  game_type: 'פלייאוף', ...extra,
})
const L = (h, a, hs, as) => G(h, a, hs, as, { game_type: 'ליגה' })
const S = (h, a, hs, as, n) => G(h, a, hs, as, { playoff_round: ROUND.series, series_game: n })

console.log('series')
t('2–0 in wins goes through without a decider', () => {
  const s = seriesState('a', 'b', [S('a', 'b', 3, 1, 1), S('b', 'a', 0, 2, 2)])
  assert.equal(s.winner, 'a'); assert.equal(s.needsDecider, false)
})
t('goals do not count: 1–1 in wins with 9–1 aggregate still needs the הכרעה', () => {
  const s = seriesState('a', 'b', [S('a', 'b', 8, 0, 1), S('b', 'a', 1, 1 - 1, 2)])
  assert.equal(s.winner, null); assert.equal(s.needsDecider, true)
})
t('win + draw goes through', () => {
  const s = seriesState('a', 'b', [S('a', 'b', 2, 2, 1), S('b', 'a', 3, 1, 2)])
  assert.equal(s.winner, 'b'); assert.equal(s.needsDecider, false)
})
t('two draws → הכרעה decides', () => {
  const s = seriesState('a', 'b', [S('a', 'b', 1, 1, 1), S('b', 'a', 2, 2, 2), S('a', 'b', 0, 1, 3)])
  assert.equal(s.winner, 'b')
})
t('one leg played → undecided even if won big', () => {
  const s = seriesState('a', 'b', [S('a', 'b', 9, 0, 1), S('b', 'a', null, null, 2)])
  assert.equal(s.winner, null); assert.equal(s.needsDecider, false)
})
t('drawn הכרעה → whoever appears in a semi went through', () => {
  const semi = G('b', 'x', null, null, { playoff_round: ROUND.semi })
  const s = seriesState('a', 'b', [S('a', 'b', 2, 0, 1), S('b', 'a', 2, 0, 2), S('a', 'b', 1, 1, 3)], [semi])
  assert.equal(s.winner, 'b')
})
t('decider scheduled but series already won → flagged unneeded', () => {
  const s = seriesState('a', 'b', [S('a', 'b', 2, 0, 1), S('b', 'a', 0, 2, 2), S('a', 'b', null, null, 3)])
  assert.equal(s.deciderUnneeded, true)
})

console.log('clinch')
t('leader out of reach → clinched', () => {
  const teams = [T(1, 30), T(2, 20), T(3, 10)]
  const g = [L('t2', 't3', null, null), L('t2', 't1', null, null), L('t3', 't1', null, null)]
  assert.equal(leaderClinched(teams, g), true) // t2 max 26
})
t('level on max points is NOT clinched (goals can still decide)', () => {
  const teams = [T(1, 26), T(2, 20)]
  const g = [L('t2', 'x', null, null), L('t2', 'y', null, null)]
  assert.equal(leaderClinched(teams, g), false) // t2 max 26
})

console.log('bracket')
const seven = () => [T(1, 40), T(2, 30), T(3, 25), T(4, 20), T(5, 15), T(6, 10), T(7, 5)]
t('hidden mid-season, visible once #1 is clinched, seeds wait for season end', () => {
  const teams = seven()
  // t2 on 30 with 4 games left can still reach 42 > 40 → not clinched
  const open4 = [1, 2, 3, 4].map(() => L('t2', 't3', null, null))
  assert.equal(buildPlayoffs(teams, open4).visible, false)
  const p = buildPlayoffs(teams, [L('t2', 't3', null, null)]) // t2 max 33 < 40
  assert.equal(p.visible, true); assert.equal(p.first.id, 't1'); assert.equal(p.series[0].t1, null)
})
t('season over → series seeded 2v7 3v6 4v5', () => {
  const p = buildPlayoffs(seven(), [L('t1', 't2', 1, 0)])
  assert.deepEqual(p.series.map(s => [s.t1.id, s.t2.id]), [['t2', 't7'], ['t3', 't6'], ['t4', 't5']])
})
t('playoff games never enter placing: league table order is the input', () => {
  const p = buildPlayoffs(seven(), [L('t1', 't2', 1, 0), S('t7', 't2', 5, 0, 1)])
  assert.equal(p.series[0].t1.id, 't2')
})
t('semis come from the games; #1 goes on its own side; drawn semi resolved by the final', () => {
  const games = [L('t1', 't2', 1, 0),
    G('t3', 't4', 1, 1, { playoff_round: ROUND.semi }),
    G('t1', 't5', 3, 2, { playoff_round: ROUND.semi }),
    G('t1', 't4', null, null, { playoff_round: ROUND.final })]
  const p = buildPlayoffs(seven(), games)
  assert.equal(p.semis[0].game.home_team_id, 't1')
  assert.equal(p.semis[1].winner, 't4')
})
t('full ranking 1–7', () => {
  const po = [L('t1', 't2', 1, 0),
    S('t2', 't7', 1, 0, 1), S('t7', 't2', 0, 1, 2),
    S('t3', 't6', 0, 1, 1), S('t6', 't3', 0, 1, 2), S('t3', 't6', 2, 0, 3),
    S('t4', 't5', 1, 1, 1), S('t5', 't4', 3, 0, 2),
    G('t1', 't5', 2, 1, { playoff_round: ROUND.semi }), G('t2', 't3', 0, 1, { playoff_round: ROUND.semi }),
    G('t1', 't3', 1, 1, { playoff_round: ROUND.final }), G('t2', 't5', 4, 2, { playoff_round: ROUND.third }),
    G('t7', 't6', 2, 0, { playoff_round: ROUND.placement }), G('t6', 't4', 1, 1, { playoff_round: ROUND.placement }),
    G('t4', 't7', 3, 3, { playoff_round: ROUND.placement })]
  const p = buildPlayoffs(seven(), po, 't3') // final drawn → admin's champion
  assert.deepEqual(p.ranking, ['t3', 't1', 't2', 't5', 't7', 't4', 't6'])
})
t('placement mini-table: points → goal diff → goals for', () => {
  const r = placementTable(['a', 'b', 'c'], [G('a', 'b', 1, 0), G('b', 'c', 1, 0), G('c', 'a', 1, 0)])
  assert.equal(r.every(x => x.points === 3), true)
  const r2 = placementTable(['a', 'b', 'c'], [G('a', 'b', 3, 0), G('b', 'c', 1, 0), G('c', 'a', 1, 0)])
  assert.equal(r2[0].id, 'a')
})
console.log(`\n${n} checks passed`)
