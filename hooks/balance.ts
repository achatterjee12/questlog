// Every number the game is balanced by, in one place. Change one here and
// the scoring, the character sheet and /questlog codex all follow; the
// README points here instead of repeating them.
import type { Deed } from '../types'

// The XP each kind of deed earns.
export const XP_PER_DEED: Record<Deed, number> = {
  craft: 15,
  battle: 10,
  scout: 5,
  lore: 8,
  summon: 20,
  misc: 3,
}

// The XP a finished turn earns.
export const XP_PER_QUEST = 25

// The XP a tool call that errors earns, in place of its deed's.
export const XP_PER_FUMBLE = 2

// Each level costs this much more XP than the one before: going from level
// L to L+1 takes XP_PER_LEVEL_STEP × L XP.
export const XP_PER_LEVEL_STEP = 100

// How many deeds of each kind earn its class. A hero's class is the kind
// they are furthest along on, count ÷ target, once any reaches its target.
// Set in proportion to how often each kind comes up in a typical session,
// so every class is about as likely: reading and searching are common,
// subagents rare.
export const CLASS_TARGETS: Record<Exclude<Deed, 'misc'>, number> = {
  scout: 40,
  battle: 30,
  craft: 25,
  lore: 5,
  summon: 2,
}
