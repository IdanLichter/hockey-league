// Monotonic, deadline-based countdown clock. Ported from CountdownClock.swift.
// Computes remaining time from an absolute monotonic deadline every refresh, so
// pauses and dropped frames never accumulate error (unlike tick-counting).
// `now` is injectable (seconds) so the engine is unit-testable without real waits.
import { GameRules } from './rules'

export const monotonicNow = () =>
  (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000

export class CountdownClock {
  constructor(remainingMS, now = monotonicNow) {
    this.remainingMS = Math.max(0, remainingMS)
    this.isRunning = false
    this._deadline = 0
    this._now = now
    this.onExpire = null
  }

  get showTenths() {
    return this.isRunning && this.remainingMS < GameRules.showTenthsBelowMS
  }

  start() {
    if (this.isRunning || this.remainingMS <= 0) return
    this._deadline = this._now() + this.remainingMS / 1000
    this.isRunning = true
  }

  pause() {
    if (!this.isRunning) return
    this._recompute()
    this.isRunning = false
  }

  // Set remaining directly (edit/reset/arming a break or period). Stops the clock.
  set(remainingMS) {
    this.isRunning = false
    this.remainingMS = Math.max(0, remainingMS)
  }

  // Recompute from the deadline; fire onExpire once at zero.
  refresh() {
    if (!this.isRunning) return
    this._recompute()
    if (this.remainingMS === 0) {
      this.isRunning = false
      this.onExpire && this.onExpire()
    }
  }

  _recompute() {
    const ms = Math.round((this._deadline - this._now()) * 1000)
    this.remainingMS = Math.max(0, ms)
  }
}
