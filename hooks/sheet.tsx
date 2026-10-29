// The character sheet /questlog prints into the transcript. The command's
// output is the sheet as plain text, so it is a snapshot of that moment and
// reads fine wherever nothing styles it; a render hook on that output row
// parses the text back and draws it with color.
import type { On } from 'claude-code'

import type { Deed, Hero, HeroClass } from '../types'
import { gradientColors, hex } from './colors'
import { xpForLevel } from './game'

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
  Berserker: 0xff6b6b,
  Ranger: 0x69db7c,
  Sage: 0x74c0fc,
  Summoner: 0xb197fc,
}

// What the sheet shows, and all the drawing needs.
type Snapshot = Pick<Hero, 'name' | 'heroClass' | 'level' | 'xp' | 'quests' | 'fumbles'> & {
  deeds: Record<Exclude<Deed, 'misc'>, number>
}

function bar(xp: number, from: number, to: number, width: number): string {
  const filled = Math.round(((xp - from) / (to - from)) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function sheetText(hero: Hero): string {
  const to = xpForLevel(hero.level + 1)
  const lines = [
    hero.name,
    `Level ${hero.level} ${hero.heroClass}`,
    `${bar(hero.xp, xpForLevel(hero.level), to, BAR_WIDTH)} ${hero.xp}/${to} XP`,
    '',
    ...DEEDS.map(([deed, label]) => `${label.padEnd(9)} ${hero.deeds[deed]}`),
    `${'Quests'.padEnd(9)} ${hero.quests}`,
    `${'Fumbles'.padEnd(9)} ${hero.fumbles}`,
  ]

  return ['```', ...lines, '```'].join('\n')
}

// The sheet back from sheetText's output, or null for any other output of
// /questlog (help, status).
export function parseSheet(text: string): Snapshot | null {
  const lines = text.split('\n').filter(line => line !== '```')
  const name = lines[0]?.trim()
  const level = lines[1]?.match(/^Level (\d+) (\w+)$/)
  const xp = lines[2]?.match(/ (\d+)\/\d+ XP$/)
  if (!name || level === null || level === undefined || xp === null || xp === undefined) {
    return null
  }

  const counts = new Map<string, number>()
  for (const line of lines.slice(3)) {
    const row = line.match(/^(\w+)\s+(\d+)$/)
    if (row !== null) {
      counts.set(row[1]!, Number(row[2]))
    }
  }
  const count = (label: string) => counts.get(label) ?? 0
  const heroClass = level[2] as HeroClass
  if (!(heroClass in CLASS_COLORS)) {
    return null
  }

  return {
    name,
    heroClass,
    level: Number(level[1]),
    xp: Number(xp[1]),
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
    const classColor = CLASS_COLORS[sheet.heroClass]
    const from = xpForLevel(sheet.level)
    const to = xpForLevel(sheet.level + 1)
    const filled = Math.round(((sheet.xp - from) / (to - from)) * BAR_WIDTH)
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
          <Text dimColor>{'░'.repeat(BAR_WIDTH - filled)}</Text> {sheet.xp}/{to} XP
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
