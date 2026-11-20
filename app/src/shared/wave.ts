/** m:ss, or h:mm:ss past an hour */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const sec = String(s % 60).padStart(2, '0')
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const ATTACK_MS = 50, RELEASE_MS = 190
const FOLLOW_MS = [28, 14, 0, 9, 22]
const BAR_DELAY_MS = 24
type MeterMotion = 'symmetric' | 'travelling'
export const RECORDING_METER_MOTION: MeterMotion = 'travelling'

function approach(from: number, target: number, ms: number, followMs = 0) {
  const tau = (target > from ? ATTACK_MS : RELEASE_MS) + followMs
  return from + (target - from) * -Math.expm1(-ms / tau)
}

export class Wave {
  target = 0
  readonly levels: number[]
  private time = 0
  private changes: { at: number; from: number; target: number }[] = []

  constructor(bars: 3 | 5 = 5, readonly motion: MeterMotion = 'symmetric') {
    this.levels = Array(bars).fill(0)
  }
  get level() {
    const index = this.motion === 'travelling' ? this.levels.length - 1 : Math.floor(this.levels.length / 2)
    return this.levels[index]
  }
  step(dtMs: number) {
    if (this.motion === 'symmetric') {
      const offset = this.levels.length === 3 ? 1 : 0
      for (let i = 0; i < this.levels.length; i++) {
        this.levels[i] = approach(this.levels[i], this.target, dtMs, FOLLOW_MS[i + offset])
      }
      return
    }

    // Each bar samples the same microphone envelope one delay behind its neighbour.
    if (this.changes[0]?.target !== this.target) {
      this.changes.unshift({ at: this.time, from: this.level, target: this.target })
    }
    this.time += dtMs
    const oldest = this.time - (this.levels.length - 1) * BAR_DELAY_MS
    for (let i = 0; i < this.levels.length; i++) {
      const at = oldest + i * BAR_DELAY_MS
      const change = this.changes.find(c => c.at <= at)
      this.levels[i] = change ? approach(change.from, change.target, at - change.at) : 0
    }
    // Drop a transition once even the last bar has reached the next one.
    while (this.changes.length > 1 && this.changes[this.changes.length - 2].at <= oldest) this.changes.pop()
  }
  snap(level: number) {
    this.levels.fill(level)
    this.changes.length = 0
    if (this.motion === 'travelling' && level !== 0) {
      this.changes.push({ at: -Infinity, from: level, target: level })
    }
  }
  settled(): boolean {
    if (this.target !== 0 || this.changes.length > 1 || this.levels.some(level => level >= 0.002)) return false
    this.snap(0)
    return true
  }
}

/** Five-bar silhouette; pause and reduced motion default to three still dots. */
export function barPlan(p: { reduced: boolean; paused: boolean; level: number; bars?: 3 | 5; stillBars?: boolean }, levels?: readonly number[]): { heights: number[]; alpha: number[] } {
  const still = p.paused || p.reduced
  if (still && !p.stillBars) return { heights: [0, 0, 0], alpha: [0.5, 0.5, 0.5] }
  const weights = p.bars === 3 ? [.75, 1, .75] : [.5, .75, 1, .75, .5]
  const level = still ? .7 : p.level
  const heights = weights.map((weight, i) => weight * (still ? level : levels?.[i] ?? level))
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
