// The character sheet /questlog prints into the transcript. The command's
// output is the sheet as plain text, so it is a snapshot of that moment and
// reads fine wherever nothing styles it; a render hook on that output row
// parses the text back and draws it with color, the newest sheet filling its
// XP bar from what the last one showed.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, ThemeKey, Timer } from 'claude-code'

import type { Deed, Hero, HeroClass } from '../types'
import { gradientColors, hex } from './colors'
import { fillDuration, fillFrame } from './fill'
import type { Frame } from './fill'
import { CLASS_BY_DEED, classProgress, levelProgress, xpForLevel } from './game'

const BAR_WIDTH = 20
const DEED_BAR_WIDTH = 10

const DEEDS: readonly (readonly [Exclude<Deed, 'misc'>, string, number])[] = [
  ['craft', 'Crafted', 0xffa94d],
  ['battle', 'Battles', 0xff6b6b],
  ['scout', 'Scouted', 0x69db7c],
  ['lore', 'Lore', 0x74c0fc],
  ['summon', 'Summons', 0xb197fc],
]

const CLASS_COLORS: Record<HeroClass, number> = {
  Adventurer: 0xadb5bd,
  Artificer: 0xffa94d,
  Warrior: 0xff6b6b,
  Ranger: 0x69db7c,
  Wizard: 0x74c0fc,
  Necromancer: 0xb197fc,
}

// The class's name is drawn in the theme color closest to its own, which
// stays readable on a light theme as well as a dark one; the border and the
// bars, solid enough to show on either, keep the raw colors above.
const CLASS_THEME_COLORS: Record<HeroClass, ThemeKey> = {
  Adventurer: 'inactive',
  Artificer: 'warning',
  Warrior: 'error',
  Ranger: 'success',
  Wizard: 'suggestion',
  Necromancer: 'merged',
}

// What classes were called before they were renamed: a sheet printed back
// then still draws, in its new class's color, under the name it shows.
const FORMER_CLASSES: Record<string, HeroClass> = {
  Novice: 'Adventurer',
  Berserker: 'Warrior',
  Barbarian: 'Warrior',
  Rogue: 'Ranger',
  Sage: 'Wizard',
  Summoner: 'Necromancer',
}

// Ticks while a sheet's bar fills; the frame is drawn from it.
const tick = atom({ plugin: 'questlog', key: 'sheetTick' } as const, 0)
const TICK_MS = 100

let ticker: Timer | undefined
// The fill the newest /questlog started, and the row drawing it once one
// claims it. Rows drawn before it never do, so an older sheet doesn't replay.
let fill: { from: number; to: number; startTick: number; row?: string } | undefined
const seenRows = new Set<string>()

function stopTicking() {
  ticker?.cancel()
  ticker = undefined
}

// Starts the fill for the sheet about to be printed, from the XP the last
// sheet showed to the XP now, and ticks until it is over.
export async function startFill($: EngineInterface, from: number, to: number) {
  stopTicking()
  const startTick = await read($, tick)
  const ticks = Math.ceil(fillDuration(from, to) / TICK_MS)
  fill = { from, to, startTick }
  try {
    ticker = $.clock.every(TICK_MS, () => {
      void update($, tick, n => n + 1).then(n => {
        if (n - startTick >= ticks) {
          stopTicking()
        }
      })
    })
  } catch {
    // With no clock the sheet draws as it stands.
    fill = undefined
  }
}

function colorOf(heroClass: string): number | undefined {
  return CLASS_COLORS[(FORMER_CLASSES[heroClass] ?? heroClass) as HeroClass]
}

function themeColorOf(heroClass: string): ThemeKey | undefined {
  return CLASS_THEME_COLORS[(FORMER_CLASSES[heroClass] ?? heroClass) as HeroClass]
}

// What the sheet shows, and all the drawing needs. XP counts within the
// current level: gained since the last level up, of what this level takes.
// `gain` is the XP earned since the last sheet, absent on a sheet printed
// before sheets told it.
type Snapshot = Pick<Hero, 'name' | 'level' | 'quests' | 'fumbles'> & {
  heroClass: string
  gained: number
  needed: number
  gain?: number
  deeds: Record<Exclude<Deed, 'misc'>, number>
}

function filledCells(gained: number, needed: number): number {
  return Math.max(0, Math.min(BAR_WIDTH, Math.round((gained / needed) * BAR_WIDTH)))
}

// One line per part, with no padding to keep: the engine prints the text
// after a "questlog: " label, and a surface may collapse runs of spaces.
export function sheetText(hero: Hero, gain: number): string {
  const { gained, needed } = levelProgress(hero)
  const filled = filledCells(gained, needed)

  return [
    `⚔ ${hero.name} · Level ${hero.level} ${hero.heroClass}`,
    `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)} ${gained}/${needed} XP · +${gain} XP`,
    DEEDS.map(([deed, label]) => `${label} ${hero.deeds[deed]}`).join(' · '),
    `Quests ${hero.quests} · Fumbles ${hero.fumbles}`,
  ].join('\n')
}

// The sheet back from sheetText's output, wherever it starts in the row's
// text, or null for any other output of /questlog (help, status).
export function parseSheet(text: string): Snapshot | null {
  const head = text.match(/⚔ (.+?) · Level (\d+) (\w+)$/m)
  const xp = text.match(/ (\d+)\/(\d+) XP(?: · \+(\d+) XP)?$/m)
  if (head === null || xp === null || colorOf(head[3]!) === undefined) {
    return null
  }

  const count = (label: string) => Number(text.match(new RegExp(`\\b${label} (\\d+)\\b`))?.[1] ?? 0)

  return {
    name: head[1]!,
    heroClass: head[3]!,
    level: Number(head[2]),
    gained: Number(xp[1]),
    needed: Number(xp[2]),
    gain: xp[3] === undefined ? undefined : Number(xp[3]),
    deeds: Object.fromEntries(DEEDS.map(([deed, label]) => [deed, count(label)])) as Snapshot['deeds'],
    quests: count('Quests'),
    fumbles: count('Fumbles'),
  }
}

export function registerSheet(on: On) {
  // A reload starts the module over: no fill is under way.
  stopTicking()
  fill = undefined
  seenRows.clear()

  on('ui.render', { component: 'CommandOutput', props: { command: 'questlog' } }, async ($, e, next) => {
    const sheet = e.props.isErrored ? null : parseSheet(e.props.text)
    if (sheet === null) {
      return next(e)
    }

    // The first row drawn of the fill's own sheet claims it.
    let frame: Frame | undefined
    if (fill !== undefined && sheet.gain !== undefined) {
      const to = xpForLevel(sheet.level) + sheet.gained
      const isFillsSheet = fill.from === to - sheet.gain && fill.to === to
      if (fill.row === undefined && isFillsSheet && !seenRows.has(e.requestId)) {
        fill.row = e.requestId
      }
      if (fill.row === e.requestId) {
        frame = fillFrame(fill.from, fill.to, ((await read($, tick)) - fill.startTick) * TICK_MS)
      }
    }
    seenRows.add(e.requestId)
    const { level, gained, needed, left, isLevelUp } = frame ?? { ...sheet, left: undefined, isLevelUp: false }

    const { Box, Text } = $.ui.resolve(e)
    const classColor = colorOf(sheet.heroClass) ?? CLASS_COLORS.Adventurer
    const classThemeColor = themeColorOf(sheet.heroClass) ?? CLASS_THEME_COLORS.Adventurer
    const filled = filledCells(gained, needed)
    // Each deed's bar is its progress toward its class, so the longest bar is
    // the class the hero is closest to, or has.
    const progress = classProgress({ ...sheet.deeds, misc: 0 })
    const most = Math.max(1, ...DEEDS.map(([deed]) => progress[deed]))
    const gradient = (text: string, start: number, end: number) =>
      gradientColors(text, start, end).map(([ch, color]) => <Text color={color}>{ch}</Text>)

    return (
      <Box
        borderStyle="round"
        borderColor={hex(classColor)}
        paddingX={1}
        flexDirection="column"
        alignSelf="flex-start"
      >
        {/* The theme's accent, not a raw color: it stays readable on a light
            theme as well as a dark one. */}
        <Text weight="bold" color="claude">
          ⚔ {sheet.name}
        </Text>
        {/* Two columns, so the counter sits right above the XP it drains into. */}
        <Box flexDirection="row" columnGap={1}>
          <Box flexDirection="column">
            <Text>
              Level {level}{' '}
              <Text color={classThemeColor} weight="bold">
                {sheet.heroClass}
              </Text>
            </Text>
            <Text>
              {gradient('█'.repeat(filled), 0xffd43b, 0xff922b)}
              <Text dimColor>{'░'.repeat(BAR_WIDTH - filled)}</Text>
            </Text>
          </Box>
          <Box flexDirection="column">
            {left === undefined ? (
              <Text> </Text>
            ) : (
              <Text color={hex(0xffd43b)} weight="bold">
                +{left} XP
              </Text>
            )}
            <Text>
              {gained}/{needed} XP
              {isLevelUp && (
                <Text color={hex(0xffd43b)} weight="bold">
                  {' '}
                  ⬆ Level up!
                </Text>
              )}
            </Text>
          </Box>
        </Box>
        <Text> </Text>
        {DEEDS.map(([deed, label, color]) => {
          const n = sheet.deeds[deed]
          // The row of the deed that earned the hero's class, under the name
          // it has now for a sheet printed before a rename.
          const isClass = CLASS_BY_DEED[deed] === (FORMER_CLASSES[sheet.heroClass] ?? sheet.heroClass)

          return (
            <Text dimColor={n === 0} weight={isClass ? 'bold' : undefined}>
              {isClass ? '★ ' : '  '}
              {label.padEnd(9)}
              {String(n).padStart(3)}{' '}
              <Text color={hex(color)}>{'▰'.repeat(Math.round((progress[deed] / most) * DEED_BAR_WIDTH))}</Text>
            </Text>
          )
        })}
        <Text> </Text>
        <Text dimColor>
          Quests {sheet.quests} · Fumbles {sheet.fumbles}
        </Text>
      </Box>
    )
  })
}
