/** m:ss, or h:mm:ss past an hour */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const sec = String(s % 60).padStart(2, '0')
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const ATTACK_MS = 50, RELEASE_MS = 190
// A syllable reaches the centre first. Its neighbours follow the same mic reading.
const FOLLOW_MS = [28, 14, 0, 9, 22]

/** Smooth the 10 Hz capture feed without delaying it behind a scrolling history. */
export class Wave {
  target = 0
  readonly levels = FOLLOW_MS.map(() => 0)
  get level() { return this.levels[2] }
  step(dtMs: number) {
    for (let i = 0; i < this.levels.length; i++) {
      const delta = this.target - this.levels[i]
      const tau = (delta > 0 ? ATTACK_MS : RELEASE_MS) + FOLLOW_MS[i]
      this.levels[i] += delta * -Math.expm1(-dtMs / tau)
    }
  }
  /** back at rest in silence (snapped to 0): nothing moves until the next level */
  settled(): boolean {
    if (this.target !== 0 || this.levels.some(level => level >= 0.002)) return false
    this.levels.fill(0)
    return true
  }
}

/** Five-bar silhouette; pause and reduced motion default to three still dots. */
export function barPlan(p: { reduced: boolean; paused: boolean; level: number; bars?: 3 | 5; stillBars?: boolean }, levels?: readonly number[]): { heights: number[]; alpha: number[] } {
  const still = p.paused || p.reduced
  if (still && !p.stillBars) return { heights: [0, 0, 0], alpha: [0.5, 0.5, 0.5] }
  const weights = p.bars === 3 ? [.75, 1, .75] : [.5, .75, 1, .75, .5]
  const level = still ? .7 : p.level
  const offset = p.bars === 3 ? 1 : 0
  const heights = weights.map((weight, i) => weight * (still ? level : levels?.[i + offset] ?? level))
  return { heights, alpha: weights.map(() => .45 + .55 * level) }
}

/** What a frame puts on screen, in whole pixels of growth and 1% steps of alpha: the same key draws the same pixels. */
export const frameKey = (plan: { heights: number[]; alpha: number[] }, span: number): string =>
  plan.heights.map((v) => Math.round(v * span)).join() + '|' + Math.round(plan.alpha[0] * 100)

const METER_GAIN = 10

/** Capture already measures dBFS. Give quiet speech more travel while retaining headroom for louder speech. */
export function micLevel({ me }: { me: number; them: number }): number {
  if (!Number.isFinite(me)) return 0
  const level = Math.max(0, Math.min(1, (me - .15) / .65)) // −51 to −12 dBFS
  return METER_GAIN * level / (1 + (METER_GAIN - 1) * level)
}
