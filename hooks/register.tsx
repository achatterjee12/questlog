import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hero } from '../types'
import { afterDeed, afterQuest, deedOf, helpText, isHeroOf, newHero, summary, xpForLevel } from './game'

const PANE = 'questlog'
const TITLE = 'Questlog'
// The live copy the pane draws from. It lasts only as long as the process,
// so every change is also saved to the store under the session's id, which
// outlives an app restart and comes back when the session is resumed.
// Change the tag when Hero's fields change: it declines what an earlier
// version stored, which outlives a reload.
const hero = atom({ plugin: 'questlog', key: 'hero' } as const, null, {
  shape: 'hero-2',
})

const STATUS_KEY = 'statusLine'
const HERO_IDS_KEY = 'heroIds'
// Saved heroes beyond this many are dropped, oldest first.
const MAX_SAVED_HEROES = 500

function heroKey(sessionId: string): string {
  return `hero:${sessionId}`
}

// The hero of the session running now: the live copy, else the saved one,
// else a new one. Checking the id also catches a /clear, which moves the
// process to a new session without a session.start.
async function loadHero($: EngineInterface): Promise<Hero> {
  const sessionId = await $.session.id()
  const live = await read($, hero)
  if (live !== null && live.sessionId === sessionId) {
    return live
  }

  const saved = await $.store.get(heroKey(sessionId))
  const [seed] = crypto.getRandomValues(new Uint32Array(1))
  const loaded = isHeroOf(saved, sessionId) ? saved : newHero(sessionId, seed ?? 0)

  return update($, hero, current =>
    current !== null && current.sessionId === sessionId ? current : loaded,
  ).then(value => value ?? loaded)
}

async function saveHero($: EngineInterface, current: Hero) {
  await $.store.set(heroKey(current.sessionId), current)

  const ids = await $.store.get(HERO_IDS_KEY)
  const known = Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []
  if (known.includes(current.sessionId)) {
    return
  }
  const all = [...known, current.sessionId]
  for (const old of all.slice(0, Math.max(0, all.length - MAX_SAVED_HEROES))) {
    await $.store.delete(heroKey(old))
  }
  await $.store.set(HERO_IDS_KEY, all.slice(-MAX_SAVED_HEROES))
}

async function isStatusOn($: EngineInterface): Promise<boolean> {
  return (await $.store.get(STATUS_KEY)) !== false
}

async function showStatus($: EngineInterface, current: Hero) {
  if (await isStatusOn($)) {
    $.ui.status(summary(current))
  }
}

const DEED_LABELS = [
  ['craft', 'Crafted'],
  ['battle', 'Battles'],
  ['scout', 'Scouted'],
  ['lore', 'Lore'],
  ['summon', 'Summons'],
] as const

async function gain($: EngineInterface, change: (current: Hero) => Hero) {
  const loaded = await loadHero($)
  let before: Hero = loaded
  const after = await update($, hero, current => {
    before = current ?? loaded
    return change(before)
  })

  if (after === null) {
    return
  }

  await saveHero($, after)
  await showStatus($, after)
  if (after.level > before.level) {
    $.ui.toast(`🎉 ${after.name} reached level ${after.level}!`)
  }
  if (after.heroClass !== before.heroClass) {
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
    // A reload or a resume runs this again: it picks up the hero this
    // session already has.
    await showStatus($, await loadHero($))

    await $.command.register({
      name: 'questlog',
      description: 'Show this session’s character sheet',
      argumentHint: '[help | status [on|off]]',
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'questlog' }, async ($, e) => {
    const [sub, value] = e.args.trim().toLowerCase().split(/\s+/)
    if (sub === 'help') {
      return { text: helpText() }
    }
    if (sub === 'status') {
      if (value !== undefined && value !== 'on' && value !== 'off') {
        return { text: 'Usage: /questlog status [on|off]' }
      }
      const isOn = value === undefined ? !(await isStatusOn($)) : value === 'on'
      await $.store.set(STATUS_KEY, isOn)
      $.ui.status(isOn ? summary(await loadHero($)) : undefined)

      return { text: `Status line ${isOn ? 'on' : 'off'}.` }
    }

    const current = await loadHero($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (opened.isPlaced) {
      return { text: 'Questlog opened.' }
    }

    // This surface can't show the pane right now: print the sheet instead.
    return {
      text: [...sheetLines(current, 20), '', `(Pane not shown: ${opened.reason})`].join('\n'),
    }
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
