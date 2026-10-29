import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hero } from '../types'
import { afterDeed, afterQuest, deedOf, newHero, summary, xpForLevel } from './game'

const PANE = 'questlog'
const TITLE = 'Questlog'
// Change the tag when Hero's fields change: it declines what an earlier
// version stored, which outlives a reload.
const hero = atom({ plugin: 'questlog', key: 'hero' } as const, null, {
  shape: 'hero-1',
})

const DEED_LABELS = [
  ['craft', 'Crafted'],
  ['battle', 'Battles'],
  ['scout', 'Scouted'],
  ['lore', 'Lore'],
  ['summon', 'Summons'],
] as const

async function gain($: EngineInterface, change: (current: Hero) => Hero) {
  let before: Hero | null = null
  const after = await update($, hero, current => {
    before = current
    return change(current ?? newHero(0))
  })

  if (after === null) {
    return
  }

  $.ui.status(summary(after))
  const previous = before as Hero | null
  if (previous !== null && after.level > previous.level) {
    $.ui.toast(`🎉 ${after.name} reached level ${after.level}!`)
  }
  if (previous !== null && after.heroClass !== previous.heroClass) {
    $.ui.toast(`${after.name} is now a ${after.heroClass}`)
  }
}

function bar(xp: number, from: number, to: number, width: number): string {
  const filled = Math.round(((xp - from) / (to - from)) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function sheetLines(current: Hero, width: number): string[] {
  const from = xpForLevel(current.level)
  const to = xpForLevel(current.level + 1)

  return [
    current.name,
    `Level ${current.level} ${current.heroClass}`,
    `${bar(current.xp, from, to, width)} ${current.xp}/${to} XP`,
    '',
    ...DEED_LABELS.map(([deed, label]) => `${label.padEnd(9)} ${current.deeds[deed]}`),
    `${'Quests'.padEnd(9)} ${current.quests}`,
    `${'Fumbles'.padEnd(9)} ${current.fumbles}`,
  ]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // A reload runs this again: keep the hero this session already has.
    if ((await read($, hero)) === null) {
      const [seed] = crypto.getRandomValues(new Uint32Array(1))
      await update($, hero, current => current ?? newHero(seed ?? 0))
    }
    const current = await read($, hero)
    if (current !== null) {
      $.ui.status(summary(current))
    }

    await $.command.register({
      name: 'questlog',
      description: 'Show this session’s character sheet',
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'questlog' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (opened.isPlaced) {
      return { text: 'Questlog opened.' }
    }

    // This surface can't show the pane right now: print the sheet instead.
    const current = await read($, hero)
    const sheet = current === null ? ['No hero yet.'] : sheetLines(current, 20)

    return { text: [...sheet, '', `(Pane not shown: ${opened.reason})`].join('\n') }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) {
      // Scoring must never change what the tool call returns.
      try {
        await gain($, current => afterDeed(current, deedOf(e.tool), ran.isError === true))
      } catch {}
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    // Only the main loop's finished turns count as quests.
    if (e.agentId === undefined && !e.isAborted) {
      await gain($, afterQuest)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const current = await read($, hero)

    if (current === null) {
      return <Text dimColor>No hero yet.</Text>
    }

    const from = xpForLevel(current.level)
    const to = xpForLevel(current.level + 1)
    const width = Math.max(5, Math.min(20, e.props.bodyColumns - 14))

    return (
      <Box flexDirection="column">
        <Text bold>{current.name}</Text>
        <Text>
          Level {current.level} {current.heroClass}
        </Text>
        <Text>
          {bar(current.xp, from, to, width)} {current.xp}/{to} XP
        </Text>
        <Text> </Text>
        {DEED_LABELS.map(([deed, label]) => (
          <Text dimColor={current.deeds[deed] === 0}>
            {label.padEnd(9)} {current.deeds[deed]}
          </Text>
        ))}
        <Text>
          {'Quests'.padEnd(9)} {current.quests}
        </Text>
        <Text dimColor={current.fumbles === 0}>
          {'Fumbles'.padEnd(9)} {current.fumbles}
        </Text>
      </Box>
    )
  })
}
