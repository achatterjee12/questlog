// The rules of the game: plain functions, no engine calls.
import type { Deed, Hero, HeroClass } from '../types'

const DEEDS_BY_TOOL: Record<string, Deed> = {
  Edit: 'craft',
  Write: 'craft',
  NotebookEdit: 'craft',
  Bash: 'battle',
  Read: 'scout',
  Grep: 'scout',
  Glob: 'scout',
  WebSearch: 'lore',
  WebFetch: 'lore',
  Agent: 'summon',
  Task: 'summon',
}

export const XP_PER_DEED: Record<Deed, number> = {
  craft: 15,
  battle: 10,
  scout: 5,
  lore: 8,
  summon: 20,
  misc: 3,
}

export const XP_PER_QUEST = 25
export const XP_PER_FUMBLE = 2

const CLASS_BY_DEED: Record<Exclude<Deed, 'misc'>, HeroClass> = {
  craft: 'Artificer',
  battle: 'Berserker',
  scout: 'Ranger',
  lore: 'Sage',
  summon: 'Summoner',
}

// A hero stays a Novice until they have done this many classed deeds.
const DEEDS_TO_EARN_CLASS = 5

const NAMES = [
  'Aldric', 'Brynn', 'Cael', 'Dagny', 'Eamon', 'Fenna', 'Gorm', 'Hesper',
  'Isolde', 'Jory', 'Kestrel', 'Lorcan', 'Maren', 'Nyx', 'Orrin', 'Perrin',
  'Quill', 'Rowan', 'Sable', 'Thane', 'Ulla', 'Vesper', 'Wren', 'Yorick',
]

export function deedOf(tool: string): Deed {
  if (tool.startsWith('mcp__')) {
    return 'lore'
  }

  return DEEDS_BY_TOOL[tool] ?? 'misc'
}

// Reaching level L takes 50 * L * (L - 1) XP in total, so each level costs
// 100 XP more than the one before it.
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1)
}

export function levelFor(xp: number): number {
  let level = 1
  while (xpForLevel(level + 1) <= xp) {
    level += 1
  }

  return level
}

export function classFor(deeds: Hero['deeds']): HeroClass {
  const ranked = (Object.keys(CLASS_BY_DEED) as Exclude<Deed, 'misc'>[])
    .map(deed => ({ deed, count: deeds[deed] }))
    .sort((a, b) => b.count - a.count)
  const total = ranked.reduce((sum, one) => sum + one.count, 0)

  if (total < DEEDS_TO_EARN_CLASS) {
    return 'Novice'
  }

  const top = ranked[0]

  return top === undefined ? 'Novice' : CLASS_BY_DEED[top.deed]
}

export function newHero(seed: number): Hero {
  return {
    name: NAMES[seed % NAMES.length] ?? 'Hero',
    heroClass: 'Novice',
    level: 1,
    xp: 0,
    deeds: { craft: 0, battle: 0, scout: 0, lore: 0, summon: 0, misc: 0 },
    quests: 0,
    fumbles: 0,
  }
}

function withXp(hero: Hero, xp: number): Hero {
  const total = hero.xp + xp

  return { ...hero, xp: total, level: levelFor(total) }
}

export function afterDeed(hero: Hero, deed: Deed, isFumble: boolean): Hero {
  if (isFumble) {
    return withXp({ ...hero, fumbles: hero.fumbles + 1 }, XP_PER_FUMBLE)
  }

  const deeds = { ...hero.deeds, [deed]: hero.deeds[deed] + 1 }

  return withXp({ ...hero, deeds, heroClass: classFor(deeds) }, XP_PER_DEED[deed])
}

export function afterQuest(hero: Hero): Hero {
  return withXp({ ...hero, quests: hero.quests + 1 }, XP_PER_QUEST)
}

export function summary(hero: Hero): string {
  return `⚔ ${hero.name} · Lv ${hero.level} ${hero.heroClass} · ${hero.xp}/${xpForLevel(hero.level + 1)} XP`
}
