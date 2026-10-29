import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'questlog',
  component: 'Pane',
  requestId: 'questlog',
  props: {
    title: 'Questlog',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// Stands in for the engine beneath the plugin. `ids` is the session id
// `$.session.id()` answers, read on each call so a test can move it; the
// store is a map the test reads back, and `lines` collects status lines.
function engine(
  on: On,
  {
    ids = { current: 's1' },
    isPlaced = true,
    saved = {} as Record<string, unknown>,
    lines = [] as (string | undefined)[],
  } = {},
) {
  const store = new Map(Object.entries(saved))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('ui.status', (_, e) => (lines.push(e.text), { value: undefined }))
  on('session.id', () => ({ value: ids.current }))
  on('command.register', () => ({ value: { command: 'questlog' } }))
  on('ui.open', () =>
    isPlaced
      ? { value: { isPlaced: true } }
      : { value: { isPlaced: false, reason: 'too narrow' } },
  )
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  return store
}

test('deeds earn XP, a class and levels, on every surface', async ($, on) => {
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // 8 edits at 15 XP each: 120 XP, past level 2's 100.
  for (let i = 0; i < 8; i += 1) {
    await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b' })
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /^Level/ }))?.text).toBe('Level 2 Artificer')
    expect((await ui.find({ type: 'Text', text: /XP$/ }))?.text).toMatch(/ 120\/300 XP$/)
    expect((await ui.find({ type: 'Text', text: /^Crafted/ }))?.text).toBe('Crafted   8')
    await ui.unmount()
  }
})

test('a hero an earlier version stored is declined', async ($, on) => {
  on('state.get', () => ({ value: { value: { xp: 'lots' }, version: 1 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('No hero yet.')
  await ui.unmount()
})

test('a resumed session gets its saved hero back', async ($, on) => {
  const saved = {
    sessionId: 's1',
    name: 'Dagny',
    heroClass: 'Berserker',
    level: 3,
    xp: 369,
    deeds: { craft: 0, battle: 10, scout: 0, lore: 2, summon: 0, misc: 1 },
    quests: 10,
    fumbles: 0,
  }
  const store = engine(on, { saved: { 'hero:s1': saved } })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Dagny/ }))?.text).toBe('Dagny')
  expect((await ui.find({ type: 'Text', text: /XP$/ }))?.text).toMatch(/ 379\/600 XP$/)
  await ui.unmount()
  expect((store.get('hero:s1') as { xp: number }).xp).toBe(379)
})

test('a new session id, as after /clear, starts a new hero', async ($, on) => {
  const ids = { current: 's1' }
  const store = engine(on, { ids })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  ids.current = 's2'
  await $.tool.call({ tool: 'Read', file_path: '/a' })

  expect((store.get('hero:s1') as { xp: number }).xp).toBe(10)
  expect((store.get('hero:s2') as { xp: number }).xp).toBe(5)
  expect(store.get('heroIds')).toEqual(['s1', 's2'])
})

test('/questlog prints the sheet when the pane cannot be shown', async ($, on) => {
  engine(on, { isPlaced: false })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'questlog', args: '' } as Parameters<typeof $.command.run>[0])

  expect(ran.text).toMatch(/Level 1 Novice/)
  expect(ran.text).toMatch(/Pane not shown: too narrow/)
})

test('/questlog status turns the status line off and on', async ($, on) => {
  const lines: (string | undefined)[] = []
  engine(on, { lines })
  const run = (args: string) =>
    $.command.run({ command: 'questlog', args } as Parameters<typeof $.command.run>[0])

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(lines.at(-1)).toMatch(/Lv 1 Novice/)

  expect((await run('status off')).text).toBe('Status line off.')
  expect(lines.at(-1)).toBeUndefined()
  const count = lines.length
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(lines.length).toBe(count)

  // With no value, it toggles.
  expect((await run('status')).text).toBe('Status line on.')
  expect(lines.at(-1)).toMatch(/10\/100 XP/)
  expect((await run('status maybe')).text).toBe('Usage: /questlog status [on|off]')
})

test('/questlog help explains XP and classes', async ($, on) => {
  engine(on)
  const run = (args: string) =>
    $.command.run({ command: 'questlog', args } as Parameters<typeof $.command.run>[0])

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const text = (await run('help')).text ?? ''

  expect(text).toMatch(/Crafting\s+15 XP\s+Edit, Write, NotebookEdit/)
  expect(text).toMatch(/Lore\s+8 XP\s+WebSearch, WebFetch, MCP tools/)
  expect(text).toMatch(/Quest\s+25 XP/)
  expect(text).toMatch(/level 2 at 100, level 3 at 300/)
  expect(text).toMatch(/Novice until you've done 5 deeds/)
  expect(text).toMatch(/Summoner\s+most summoning/)
  // Asking for help earns nothing and leaves the hero as it was.
  expect((await run('')).text).toBe('Questlog opened.')
})
