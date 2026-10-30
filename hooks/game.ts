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
  battle: 'Warrior',
  scout: 'Ranger',
  lore: 'Wizard',
  summon: 'Necromancer',
}

// A hero stays an Adventurer until they have done this many classed deeds.
const DEEDS_TO_EARN_CLASS = 5

const NAMES = [
  'Aldric', 'Brynn', 'Cael', 'Dagny', 'Eamon', 'Fenna', 'Gorm', 'Hesper',
  'Isolde', 'Jory', 'Kestrel', 'Lorcan', 'Maren', 'Nyx', 'Orrin', 'Perrin',
  'Quill', 'Rowan', 'Sable', 'Thane', 'Ulla', 'Vesper', 'Wren', 'Yorick',
]

export const MAX_NAME_LENGTH = 24

// A name as /questlog rename was given it, made fit for the sheet: one line,
// runs of spaces as one, and no '·', which the sheet uses as its separator.
export function cleanName(raw: string): string {
  return raw.replace(/[\p{Cc}·]/gu, ' ').replace(/\s+/g, ' ').trim()
}

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

// How far into the current level a hero is: XP gained since the last level
// up, and the XP that level takes in all.
export function levelProgress(hero: Pick<Hero, 'xp' | 'level'>): { gained: number; needed: number } {
  const from = xpForLevel(hero.level)

  return { gained: hero.xp - from, needed: xpForLevel(hero.level + 1) - from }
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
    return 'Adventurer'
  }

  const top = ranked[0]

  return top === undefined ? 'Adventurer' : CLASS_BY_DEED[top.deed]
}

// A saved hero with the class its deeds earn under today's rules, so one
// saved before a class was renamed comes back under the new name.
export function withCurrentClass(hero: Hero): Hero {
  return { ...hero, heroClass: classFor(hero.deeds) }
}

export function newHero(sessionId: string, seed: number): Hero {
  return {
    sessionId,
    name: NAMES[seed % NAMES.length] ?? 'Hero',
    heroClass: 'Adventurer',
    level: 1,
    xp: 0,
    deeds: { craft: 0, battle: 0, scout: 0, lore: 0, summon: 0, misc: 0 },
    quests: 0,
    fumbles: 0,
  }
}

// What the store holds is trusted only if it looks like a hero of this session.
export function isHeroOf(value: unknown, sessionId: string): value is Hero {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const maybe = value as Partial<Hero>

  return (
    maybe.sessionId === sessionId &&
    typeof maybe.name === 'string' &&
    typeof maybe.xp === 'number' &&
    typeof maybe.deeds === 'object' &&
    maybe.deeds !== null
  )
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

const DEED_NAMES: Record<Deed, string> = {
  craft: 'Crafting',
  battle: 'Battle',
  scout: 'Scouting',
  lore: 'Lore',
  summon: 'Summoning',
  misc: 'Anything else',
}

export const HELP_INTRO =
  'Questlog turns this session into an RPG hero. Every tool Claude uses is a deed that earns XP; finished turns are quests.'

// One section of /questlog help: a heading, an optional sentence, and rows
// whose cells line up in columns; `isCode` when the first column is
// something to type, drawn in a code font.
export type HelpSection = { heading: string; note?: string; rows: string[][]; isCode?: boolean }

// The rules as /questlog help shows them, built from the tables above so
// the two can't disagree. The help keeps every number back, to be found by
// playing; the codex reveals them: XP per deed, the class threshold and
// the leveling formula.
export function helpSections(isCodex: boolean): HelpSection[] {
  const toolsOf = (deed: Deed) => {
    const tools = Object.keys(DEEDS_BY_TOOL).filter(tool => DEEDS_BY_TOOL[tool] === deed)
    if (deed === 'lore') {
      tools.push('MCP tools')
    }

    return deed === 'misc' ? 'other tools' : tools.join(', ')
  }
  const deeds = Object.keys(XP_PER_DEED) as Deed[]
  const classed = Object.keys(CLASS_BY_DEED) as Exclude<Deed, 'misc'>[]
  const named = classed.map(deed => DEED_NAMES[deed].toLowerCase())

  const earning: HelpSection = isCodex
    ? {
        heading: 'Earning XP',
        rows: [
          ...deeds.map(deed => [DEED_NAMES[deed], `${XP_PER_DEED[deed]} XP`, toolsOf(deed)]),
          ['Quest', `${XP_PER_QUEST} XP`, 'each finished turn'],
          ['Fumble', `${XP_PER_FUMBLE} XP`, 'a tool call that errors, in place of its deed'],
        ],
      }
    : {
        heading: 'Earning XP',
        note: `Your hero earns XP for everything Claude does: ${named.slice(0, -1).join(', ')} and ${named.at(-1)}, and every turn it finishes. How much each is worth is yours to find out, or to read in /questlog codex.`,
        rows: [],
      }
  const levels = [2, 3, 4, 5, 6].map(level => [
    `Level ${level}`,
    `${xpForLevel(level) - xpForLevel(level - 1)} XP after level ${level - 1}`,
    `${xpForLevel(level)} XP in all`,
  ])

  return [
    earning,
    ...(isCodex
      ? [
          {
            heading: 'Leveling',
            note: 'Going from level L to level L+1 takes 100 × L XP, so reaching level L takes 50 × L × (L − 1) XP in all.',
            rows: levels,
          },
        ]
      : []),
    {
      heading: 'Classes',
      note: isCodex
        ? `You're an Adventurer until you've done ${DEEDS_TO_EARN_CLASS} deeds. Then your class is whichever deed you have done most, and it can change as you go.`
        : "You start as an Adventurer. Once you've done enough deeds, your class is whichever deed you do most, and it can change as you go.",
      rows: classed.map(deed => [CLASS_BY_DEED[deed], `most ${DEED_NAMES[deed].toLowerCase()}`]),
    },
    {
      heading: 'Commands',
      isCode: true,
      rows: [
        ['/questlog', 'print the character sheet'],
        ['/questlog status [on|off]', 'show, hide or toggle the status line'],
        ['/questlog rename <name>', "rename this session's hero"],
        ['/questlog help', 'how Questlog plays, without the numbers'],
        ['/questlog codex', 'every number: XP per deed, the class threshold, leveling'],
        ['/questlog gallery', 'show off what the pane can draw'],
      ],
    },
  ]
}

// The help as plain text, for wherever it is not drawn styled: cells are
// joined by '·' rather than padded, since a surface may collapse spaces.
export function helpText(isCodex: boolean): string {
  return [
    HELP_INTRO,
    ...helpSections(isCodex).flatMap(({ heading, note, rows }) => [
      '',
      heading,
      ...(note === undefined ? [] : [note]),
      ...rows.map(cells => cells.join(' · ')),
    ]),
  ].join('\n')
}

export function summary(hero: Hero): string {
  const { gained, needed } = levelProgress(hero)

  return `⚔ ${hero.name} · Lv ${hero.level} ${hero.heroClass} · ${gained}/${needed} XP`
}
