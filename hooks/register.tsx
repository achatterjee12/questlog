import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hero } from '../types'
import { openGallery, registerGallery } from './gallery'
import {
  afterDeed,
  afterQuest,
  cleanName,
  deedOf,
  helpText,
  isHeroOf,
  MAX_NAME_LENGTH,
  newHero,
  summary,
  withCurrentClass,
  withXp,
} from './game'
import { registerHelp } from './help'
import { registerSheet, sheetText, startFill } from './sheet'

// The live copy of the hero. It lasts only as long as the process,
// so every change is also saved to the store under the session's id, which
// outlives an app restart and comes back when the session is resumed.
// Change the tag when Hero's fields or class names change: it declines what an earlier
// version stored, which outlives a reload.
const hero = atom({ plugin: 'questlog', key: 'hero' } as const, null, {
  shape: 'hero-4',
})

const STATUS_KEY = 'statusLine'
const HERO_IDS_KEY = 'heroIds'
// Saved heroes beyond this many are dropped, oldest first.
const MAX_SAVED_HEROES = 500

function heroKey(sessionId: string): string {
  return `hero:${sessionId}`
}

// The XP the last sheet of the session showed, which the next one fills from.
function shownKey(sessionId: string): string {
  return `shown:${sessionId}`
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
  const loaded = isHeroOf(saved, sessionId) ? withCurrentClass(saved) : newHero(sessionId, seed ?? 0)

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
    await $.store.delete(shownKey(old))
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

export const register: Register = on => {
  registerGallery(on)
  registerSheet(on)
  registerHelp(on)

  on('session.start', async ($, e, next) => {
    // A reload or a resume runs this again: it picks up the hero this
    // session already has.
    await showStatus($, await loadHero($))

    await $.command.register({
      name: 'questlog',
      description: 'Show this session’s character sheet',
      argumentHint: '[help | codex | rename <name> | status [on|off] | gallery]',
    })

    return next(e)
  })

  on('command.run', { command: 'questlog' }, async ($, e) => {
    const [sub, value] = e.args.trim().toLowerCase().split(/\s+/)
    if (sub === 'help' || sub === 'codex') {
      return { text: helpText(sub === 'codex') }
    }
    if (sub === 'rename') {
      // The name keeps the case it was typed in.
      const name = cleanName(e.args.trim().slice('rename'.length))
      if (name === '') {
        return { text: 'Usage: /questlog rename <name>' }
      }
      if ([...name].length > MAX_NAME_LENGTH) {
        return { text: `A hero's name can be at most ${MAX_NAME_LENGTH} characters.` }
      }
      const before = (await loadHero($)).name
      await gain($, current => ({ ...current, name }))

      return { text: `${before} is now known as ${name}.` }
    }
    // TEMPORARY, for trying out the XP bar's fill: remove before release.
    if (sub === 'add') {
      const xp = Number(value)
      if (!Number.isInteger(xp) || xp < 1) {
        return { text: 'Usage: /questlog add <xp>' }
      }
      await gain($, current => withXp(current, xp))

      return { text: `Added ${xp} XP.` }
    }
    if (sub === 'gallery') {
      const opened = await openGallery($)

      return {
        text: opened.isPlaced
          ? 'Gallery opened.'
          : `The gallery needs a pane, and this surface can't show one: ${opened.reason}`,
      }
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

    // The first sheet of a session fills from the hero's start.
    const current = await loadHero($)
    const shown = await $.store.get(shownKey(current.sessionId))
    const from = typeof shown === 'number' ? Math.min(shown, current.xp) : 0
    await $.store.set(shownKey(current.sessionId), current.xp)
    await startFill($, from, current.xp)

    return { text: sheetText(current, current.xp - from) }
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
}
