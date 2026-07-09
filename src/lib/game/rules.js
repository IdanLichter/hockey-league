// Fixed rule constants + operator-configurable settings for the game engine.
// Ported from HockeyTimer-iOS Sources/Shared/Model/GameRules.swift (the faithful,
// bug-fixed rebuild of the Android original). See REBUILD-SPEC.md.

export const GameRules = {
  blueCardSeconds: 120,          // 2:00
  redCardSeconds: 240,           // 4:00
  blueCardStackSeconds: [120, 240, 300],
  passiveSeconds: 45,
  passiveFlashAt: 10,
  maxTimeoutsPerPeriod: 2,
  timeoutBreakSeconds: 60,
  teamFoulEvery: 5,              // auto buzz+pause on every 5th team foul
  showTenthsBelowMS: 60_000,     // show a tenths digit inside the final minute
  resetDoubleTapWindowMS: 300,
  // League default confirmed with the product owner (2026-07-09): 25:00.
  defaultPeriodMS: 25 * 60 * 1000,
}

// Match formats.
export const GameFormat = { twoHalves: 'twoHalves', threeThirds: 'threeThirds' }

// Operator-configurable, persisted per game.
export function defaultSettings() {
  return {
    periodMS: GameRules.defaultPeriodMS,   // 25:00
    format: GameFormat.twoHalves,
    overtimeEnabled: true,
    halfBreakMinutes: 5,
    passivePlayEnabled: true,
  }
}

export const halfBreakMS = (settings) => settings.halfBreakMinutes * 60_000

// Play segments. Stable string keys (never localized) — the original matched on
// localized names, which silently broke the timeout cap.
export const Half = { first: 'first', second: 'second', third: 'third', ot1: 'ot1', ot2: 'ot2' }
export const halfIndex = { first: 0, second: 1, third: 2, ot1: 3, ot2: 4 }
export const isOvertime = (h) => h === Half.ot1 || h === Half.ot2

// High-level clock/match phase.
export const Phase = {
  ready: 'ready', readyOvertime: 'readyOvertime', running: 'running',
  paused: 'paused', breakTime: 'breakTime', editing: 'editing', over: 'over',
}

export const BreakKind = { halftime: 'halftime', homeTimeout: 'homeTimeout', guestTimeout: 'guestTimeout' }
export const CardType = { blue: 'blue', red: 'red' }
export const cardBaseSeconds = (type) => (type === CardType.red ? GameRules.redCardSeconds : GameRules.blueCardSeconds)
export const TeamSide = { home: 'home', guest: 'guest' }
