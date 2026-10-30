// How the sheet's XP bar fills, from the XP the last sheet showed to the XP
// now: a timeline of fills and pauses, and the frame it shows at a moment.
import { levelFor, xpForLevel } from './game'

// A fill of less than this share of its level's bar is quick; a longer one
// takes its time.
const QUICK_FILL_SHARE = 0.1
const QUICK_FILL_MS = 1000
const SLOW_FILL_MS = 2000
// Several level ups fill all the levels completed in this long together.
const LEVELS_FILL_MS = 4000
const LEVEL_UP_PAUSE_MS = 2000
// How long the counter shows +0 XP before it goes.
const LINGER_MS = 2000

// What the sheet draws at one moment. `left` is the XP of the gain not yet
// poured into the bar, absent once its counter has gone.
export type Frame = {
  level: number
  gained: number
  needed: number
  left?: number
  isLevelUp: boolean
}

type Step =
  | { kind: 'fill'; from: number; to: number; ms: number }
  | { kind: 'pause'; level: number; ms: number }
  | { kind: 'linger'; ms: number }

function neededFor(level: number): number {
  return xpForLevel(level + 1) - xpForLevel(level)
}

// From `from` to `to` within one level, at the pace its share of the bar sets.
function fillWithin(from: number, to: number): Step {
  const share = (to - from) / neededFor(levelFor(from))

  return { kind: 'fill', from, to, ms: share < QUICK_FILL_SHARE ? QUICK_FILL_MS : SLOW_FILL_MS }
}

function steps(from: number, to: number): Step[] {
  const linger: Step = { kind: 'linger', ms: LINGER_MS }
  if (to <= from) {
    return [linger]
  }

  const fromLevel = levelFor(from)
  const toLevel = levelFor(to)
  if (toLevel === fromLevel) {
    return [fillWithin(from, to), linger]
  }

  // Up to the start of the level the hero is in now, a pause on the level
  // up, then on into the new level.
  const top = xpForLevel(toLevel)
  const upward: Step =
    toLevel - fromLevel === 1 ? fillWithin(from, top) : { kind: 'fill', from, to: top, ms: LEVELS_FILL_MS }

  return [
    upward,
    { kind: 'pause', level: toLevel, ms: LEVEL_UP_PAUSE_MS },
    ...(to > top ? [fillWithin(top, to)] : []),
    linger,
  ]
}

export function fillDuration(from: number, to: number): number {
  return steps(from, to).reduce((sum, step) => sum + step.ms, 0)
}

// Slow to start, quick in the middle, slow to settle.
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

function frameAt(xp: number, to: number): Frame {
  const level = levelFor(xp)

  return { level, gained: xp - xpForLevel(level), needed: neededFor(level), left: to - xp, isLevelUp: false }
}

// The frame `elapsed` ms in, or undefined once the timeline is over and the
// sheet draws as it stands, with no counter.
export function fillFrame(from: number, to: number, elapsed: number): Frame | undefined {
  let start = 0
  for (const step of steps(from, to)) {
    if (elapsed < start + step.ms) {
      const t = Math.max(0, elapsed - start) / step.ms
      switch (step.kind) {
        case 'fill':
          return frameAt(Math.round(step.from + (step.to - step.from) * easeInOut(t)), to)
        case 'pause': {
          // The bar of the level just completed, full, under the new level.
          const needed = neededFor(step.level - 1)

          return { level: step.level, gained: needed, needed, left: to - xpForLevel(step.level), isLevelUp: true }
        }
        case 'linger':
          return frameAt(to, to)
      }
    }
    start += step.ms
  }

  return undefined
}
