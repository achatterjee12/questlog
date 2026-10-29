import { expect, mock, test } from 'claude-code/testing'
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
  // The engine's own drawing of an output row: its text as is.
  on('ui.render', { component: 'CommandOutput' }, (_, e) => ({
    type: 'Text',
    children: [e.props.text],
  }))

  return store
}

// Runs /questlog with `args` and draws its output row as the transcript would.
async function questlog(
  $: Parameters<Parameters<typeof test>[1]>[0],
  args: string,
  surface: 'terminal' | 'desktop',
) {
  const ran = await $.command.run({ command: 'questlog', args } as Parameters<typeof $.command.run>[0])
  const text = ran.text ?? ''
  const ui = await $.ui.mount({
    plugin: 'questlog',
    component: 'CommandOutput',
    props: { command: 'questlog', args, text, isErrored: false },
    surface,
  })

  return { text, ui }
}

test('deeds earn XP, a class and levels, on every surface', async ($, on) => {
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // 8 edits at 15 XP each: 120 XP, 20 past level 2's 100 of the 200 it takes.
  for (let i = 0; i < 8; i += 1) {
    await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b' })
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    const { ui } = await questlog($, '', surface)

    expect((await ui.find({ type: 'Text', text: /^Level/ }))?.text).toBe('Level 2 Artificer')
    expect((await ui.find({ type: 'Text', text: /XP$/ }))?.text).toMatch(/^█{2}░{18} 20\/200 XP$/)
    expect((await ui.find({ type: 'Text', text: /^Crafted/ }))?.text).toMatch(/^Crafted\s+8 ▰{10}$/)
    await ui.unmount()
  }
})

test('the sheet is a snapshot that reads as plain text too', async ($, on) => {
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const { text, ui } = await questlog($, '', 'desktop')
  await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b' })

  // Plain, it still reads as a sheet after the engine's "questlog: " label.
  expect(text).toMatch(/^⚔ \w+ · Level 1 Novice\n.* 0\/100 XP\n/)
  expect(text).toMatch(/\nCrafted 0 · Battles 0 · Scouted 0 · Lore 0 · Summons 0\n/)
  // The row drawn earlier keeps what it showed.
  expect((await ui.find({ type: 'Text', text: /XP$/ }))?.text).toMatch(/ 0\/100 XP$/)
  await ui.unmount()
})

test('a sheet behind the engine\'s "questlog: " label still draws', async ($, on) => {
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const { text } = await $.command.run({ command: 'questlog', args: '' } as Parameters<
    typeof $.command.run
  >[0])
  const ui = await $.ui.mount({
    plugin: 'questlog',
    component: 'CommandOutput',
    props: { command: 'questlog', args: '', text: `questlog: ${text}`, isErrored: false },
    surface: 'desktop',
  })

  expect((await ui.find({ type: 'Text', text: /^Level/ }))?.text).toBe('Level 1 Novice')
  expect((await ui.find({ type: 'Text', text: /^Battles/ }))?.text).toMatch(/^Battles\s+1 ▰{10}$/)
  expect(await ui.find({ type: 'Text', text: /questlog:/ })).toBeUndefined()
  await ui.unmount()
})

test('a hero an earlier version stored is declined', async ($, on) => {
  engine(on)
  // State as an earlier version left it: the hero's slot holds a value of an
  // old shape until the plugin writes over it.
  const slots = new Map<string, { value: unknown; version: number }>([
    ['questlog/hero', { value: { value: { xp: 'lots' }, version: 1 }, version: 1 }],
  ])
  on('state.get', (_, e) => ({ value: slots.get(`${e.plugin}/${e.key}`) ?? { value: undefined, version: 0 } }))
  on('state.set', (_, e) => {
    const id = `${e.plugin}/${e.key}`
    const version = (slots.get(id)?.version ?? 0) + 1
    slots.set(id, { value: e.value, version })

    return { value: { isSet: true as const, version } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const { text, ui } = await questlog($, '', 'desktop')

  expect(text).toMatch(/Level 1 Novice/)
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

  const { text, ui } = await questlog($, '', 'desktop')
  expect(text).toMatch(/\n█{5}░{15} 79\/300 XP\n/)
  expect((await ui.find({ type: 'Text', text: /Dagny$/ }))?.text).toBe('⚔ Dagny')
  // 379 XP is 79 into level 3, which runs from 300 to 600.
  expect((await ui.find({ type: 'Text', text: /XP$/ }))?.text).toMatch(/^█{5}░{15} 79\/300 XP$/)
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

test('other /questlog output is left as the engine draws it', async ($, on) => {
  engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const { ui } = await questlog($, 'help', 'terminal')

  expect(await ui.find({ type: 'Text', text: /^⚔/ })).toBeUndefined()
  await ui.unmount()
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
  expect(text).toMatch(/Novice until you've done 5 deeds/)
  expect(text).toMatch(/Summoner\s+most summoning/)
  // Asking for help earns nothing and leaves the hero as it was.
  expect((await run('')).text).toMatch(/Level 1 Novice\n.* 0\/100 XP/)
})

test('/questlog gallery opens a pane that animates', async ($, on) => {
  engine(on)
  const clock = mock.clock(on)
  const run = (args: string) =>
    $.command.run({ command: 'questlog', args } as Parameters<typeof $.command.run>[0])
  const percent = async (ui: { find: typeof terminal.find }) =>
    (await ui.find({ type: 'Text', text: /%$/ }))?.text.match(/(\d+)%$/)?.[1]

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await run('gallery')).text).toBe('Gallery opened.')

  const terminal = await $.ui.mount({ ...PANE, requestId: 'questlog-gallery', surface: 'terminal' })
  const desktop = await $.ui.mount({ ...PANE, requestId: 'questlog-gallery', surface: 'desktop' })
  for (const heading of ['Colors', 'Styles', 'Gradients', 'Animated', 'Borders', 'Hover', 'Pixels']) {
    expect(await terminal.find({ type: 'Text', text: heading })).toBeDefined()
  }
  expect(await terminal.find({ type: 'Raster' })).toBeDefined()
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()

  // Ten ticks a second: half a second fills the bar from 0% to 13%.
  expect(await percent(terminal)).toBe('0')
  await clock.advance(500)
  expect(await percent(terminal)).toBe('13')
  expect(await percent(desktop)).toBe('13')
})

test('/questlog rename renames this session\'s hero', async ($, on) => {
  const lines: (string | undefined)[] = []
  const store = engine(on, { lines })
  const run = async (args: string) =>
    (await $.command.run({ command: 'questlog', args } as Parameters<typeof $.command.run>[0])).text

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const before = (store.get('hero:s1') as { name: string } | undefined)?.name ?? ''

  // The name keeps its case; the sheet's separator and extra spaces go.
  expect(await run('rename   Sir  Lance·lot ')).toMatch(/ is now known as Sir Lance lot\.$/)
  expect((store.get('hero:s1') as { name: string }).name).toBe('Sir Lance lot')
  expect(lines.at(-1)).toMatch(/^⚔ Sir Lance lot · Lv 1 Novice/)
  expect(await run('')).toMatch(/^⚔ Sir Lance lot · Level 1 Novice\n/)
  expect(before).not.toBe('Sir Lance lot')

  expect(await run('rename')).toBe('Usage: /questlog rename <name>')
  expect(await run('rename ' + 'x'.repeat(25))).toBe("A hero's name can be at most 24 characters.")
  expect((store.get('hero:s1') as { name: string; xp: number }).xp).toBe(0)
})
