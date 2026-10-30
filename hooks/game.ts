// The rules of the game: plain functions, no engine calls.
import type { Deed, Hero, HeroClass } from '../types'
import { CLASS_TARGETS, XP_PER_DEED, XP_PER_FUMBLE, XP_PER_LEVEL_STEP, XP_PER_QUEST } from './balance'

export { CLASS_TARGETS, XP_PER_DEED, XP_PER_FUMBLE, XP_PER_LEVEL_STEP, XP_PER_QUEST }

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

export const CLASS_BY_DEED: Record<Exclude<Deed, 'misc'>, HeroClass> = {
  craft: 'Artificer',
  battle: 'Warrior',
  scout: 'Ranger',
  lore: 'Wizard',
  summon: 'Necromancer',
}

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

// The desktop app's own tools, such as task-list updates, are its plumbing,
// not the hero looking anything up.
const DESKTOP_TOOL_PREFIX = 'mcp__ccd_'

export function deedOf(tool: string): Deed {
  if (tool.startsWith(DESKTOP_TOOL_PREFIX)) {
    return 'misc'
  }
  if (tool.startsWith('mcp__')) {
    return 'lore'
  }

  return DEEDS_BY_TOOL[tool] ?? 'misc'
}

// Going from level L to L+1 takes XP_PER_LEVEL_STEP × L XP, so reaching
// level L takes XP_PER_LEVEL_STEP × L × (L − 1) / 2 in all.
export function xpForLevel(level: number): number {
  return (XP_PER_LEVEL_STEP * level * (level - 1)) / 2
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

// How far along a hero is on each kind of deed toward its class: count ÷
// target, so 1 is the target reached. Rare kinds have small targets, so
// each of their deeds counts for more.
export function classProgress(deeds: Hero['deeds']): Record<Exclude<Deed, 'misc'>, number> {
  const kinds = Object.keys(CLASS_TARGETS) as Exclude<Deed, 'misc'>[]

  return Object.fromEntries(kinds.map(deed => [deed, deeds[deed] / CLASS_TARGETS[deed]])) as Record<
    Exclude<Deed, 'misc'>,
    number
  >
}

// The class a hero's deeds earn: an Adventurer until some kind reaches its
// target, then the kind they are furthest along on. On a tie the hero keeps
// `current`, so the class doesn't flicker between two.
export function classFor(deeds: Hero['deeds'], current: HeroClass = 'Adventurer'): HeroClass {
  const progress = classProgress(deeds)
  const ranked = (Object.keys(progress) as Exclude<Deed, 'misc'>[]).sort((a, b) => progress[b] - progress[a])
  const top = ranked[0]
  if (top === undefined || progress[top] < 1) {
    return 'Adventurer'
  }

  const tied = ranked.filter(deed => progress[deed] === progress[top])
  const kept = tied.find(deed => CLASS_BY_DEED[deed] === current)

  return CLASS_BY_DEED[kept ?? top]
}

// The shape of Hero that this version saves. Raise it when a field is
// renamed or changes meaning, and teach migrateHero to read the old one.
export const HERO_VERSION = 1

export function newHero(sessionId: string, seed: number): Hero {
  return {
    version: HERO_VERSION,
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

// A hero as the store holds it, brought up to this version's shape, or
// undefined when it isn't a hero of this session. Whatever an earlier
// version saved keeps its progress: a field it didn't have starts where a
// new hero's does, a value that doesn't make sense counts as none, and the
// level and class are worked out again under today's rules, so a hero saved
// before a rename or a rebalance comes back right.
export function migrateHero(value: unknown, sessionId: string): Hero | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const saved = value as Record<string, unknown>
  if (saved.sessionId !== sessionId) {
    return undefined
  }

  const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)
  const fresh = newHero(sessionId, 0)
  const savedDeeds = (typeof saved.deeds === 'object' && saved.deeds !== null ? saved.deeds : {}) as Record<
    string,
    unknown
  >
  const deeds = Object.fromEntries(
    (Object.keys(fresh.deeds) as Deed[]).map(deed => [deed, count(savedDeeds[deed])]),
  ) as Hero['deeds']
  const name = typeof saved.name === 'string' ? cleanName(saved.name) : ''
  const xp = count(saved.xp)

  return {
    ...fresh,
    name: name === '' ? fresh.name : name,
    heroClass: classFor(deeds, typeof saved.heroClass === 'string' ? (saved.heroClass as HeroClass) : 'Adventurer'),
    level: levelFor(xp),
    xp,
    deeds,
    quests: count(saved.quests),
    fumbles: count(saved.fumbles),
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

  return withXp({ ...hero, deeds, heroClass: classFor(deeds, hero.heroClass) }, XP_PER_DEED[deed])
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
            note: `Going from level L to level L+1 takes ${XP_PER_LEVEL_STEP} × L XP, so reaching level L takes ${XP_PER_LEVEL_STEP / 2} × L × (L − 1) XP in all.`,
            rows: levels,
          },
        ]
      : []),
    {
      heading: 'Classes',
      note: isCodex
        ? "Each class has a target number of deeds. You're an Adventurer until one kind of deed reaches its target; then your class is the kind you're furthest along on, its count divided by its target, so rarer deeds count for more. It can change as you go, and on a tie you keep the class you have."
        : "You start as an Adventurer. Once you've done enough of one kind of deed, your class is the kind you lean on most, with rarer deeds counting for more, and it can change as you go.",
      rows: classed.map(deed =>
        isCodex
          ? [CLASS_BY_DEED[deed], DEED_NAMES[deed].toLowerCase(), `${CLASS_TARGETS[deed]} deeds`]
          : [CLASS_BY_DEED[deed], `from ${DEED_NAMES[deed].toLowerCase()}`],
      ),
    },
    {
      heading: 'Commands',
      isCode: true,
      rows: [
        ['/questlog', 'print the character sheet'],
        ['/questlog status [on|off]', 'show, hide or toggle the status line'],
        ['/questlog rename <name>', "rename this session's hero"],
        ['/questlog reset', 'start this session over with a new hero, after you confirm'],
        ['/questlog help', 'how Questlog plays, without the numbers'],
        ['/questlog codex', 'every number: XP per deed, class targets, leveling'],
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
