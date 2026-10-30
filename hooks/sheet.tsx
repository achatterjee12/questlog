// The character sheet /questlog prints into the transcript. The command's
// output is the sheet as plain text, so it is a snapshot of that moment and
// reads fine wherever nothing styles it; a render hook on that output row
// parses the text back and draws it with color.
import type { On } from 'claude-code'

import type { Deed, Hero, HeroClass } from '../types'
import { gradientColors, hex } from './colors'
import { levelProgress } from './game'

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
  Novice: 0xadb5bd,
  Artificer: 0xffa94d,
  Barbarian: 0xff6b6b,
  Rogue: 0x69db7c,
  Wizard: 0x74c0fc,
  Necromancer: 0xb197fc,
}

// What classes were called before they were renamed: a sheet printed back
// then still draws, in its new class's color, under the name it shows.
const FORMER_CLASSES: Record<string, HeroClass> = {
  Berserker: 'Barbarian',
  Ranger: 'Rogue',
  Sage: 'Wizard',
  Summoner: 'Necromancer',
}

function colorOf(heroClass: string): number | undefined {
  return CLASS_COLORS[(FORMER_CLASSES[heroClass] ?? heroClass) as HeroClass]
}

// What the sheet shows, and all the drawing needs. XP counts within the
// current level: gained since the last level up, of what this level takes.
type Snapshot = Pick<Hero, 'name' | 'level' | 'quests' | 'fumbles'> & {
  heroClass: string
  gained: number
  needed: number
  deeds: Record<Exclude<Deed, 'misc'>, number>
}

function filledCells(gained: number, needed: number): number {
  return Math.max(0, Math.min(BAR_WIDTH, Math.round((gained / needed) * BAR_WIDTH)))
}

// One line per part, with no padding to keep: the engine prints the text
// after a "questlog: " label, and a surface may collapse runs of spaces.
export function sheetText(hero: Hero): string {
  const { gained, needed } = levelProgress(hero)
  const filled = filledCells(gained, needed)

  return [
    `⚔ ${hero.name} · Level ${hero.level} ${hero.heroClass}`,
    `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)} ${gained}/${needed} XP`,
    DEEDS.map(([deed, label]) => `${label} ${hero.deeds[deed]}`).join(' · '),
    `Quests ${hero.quests} · Fumbles ${hero.fumbles}`,
  ].join('\n')
}

// The sheet back from sheetText's output, wherever it starts in the row's
// text, or null for any other output of /questlog (help, status).
export function parseSheet(text: string): Snapshot | null {
  const head = text.match(/⚔ (.+?) · Level (\d+) (\w+)$/m)
  const xp = text.match(/ (\d+)\/(\d+) XP$/m)
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
    deeds: Object.fromEntries(DEEDS.map(([deed, label]) => [deed, count(label)])) as Snapshot['deeds'],
    quests: count('Quests'),
    fumbles: count('Fumbles'),
  }
}

export function registerSheet(on: On) {
  on('ui.render', { component: 'CommandOutput', props: { command: 'questlog' } }, async ($, e, next) => {
    const sheet = e.props.isErrored ? null : parseSheet(e.props.text)
    if (sheet === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const classColor = colorOf(sheet.heroClass) ?? CLASS_COLORS.Novice
    const filled = filledCells(sheet.gained, sheet.needed)
    const most = Math.max(1, ...DEEDS.map(([deed]) => sheet.deeds[deed]))
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
        <Text weight="bold">{gradient(`⚔ ${sheet.name}`, 0xffd43b, classColor)}</Text>
        <Text>
          Level {sheet.level}{' '}
          <Text color={hex(classColor)} weight="bold">
            {sheet.heroClass}
          </Text>
        </Text>
        <Text>
          {gradient('█'.repeat(filled), 0xffd43b, 0xff922b)}
          <Text dimColor>{'░'.repeat(BAR_WIDTH - filled)}</Text> {sheet.gained}/{sheet.needed} XP
        </Text>
        <Text> </Text>
        {DEEDS.map(([deed, label, color]) => {
          const n = sheet.deeds[deed]

          return (
            <Text dimColor={n === 0}>
              {label.padEnd(9)}
              {String(n).padStart(3)}{' '}
              <Text color={hex(color)}>{'▰'.repeat(Math.round((n / most) * DEED_BAR_WIDTH))}</Text>
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
