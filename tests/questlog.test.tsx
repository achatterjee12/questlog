import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CLASS_TARGETS, XP_PER_DEED, XP_PER_LEVEL_STEP, XP_PER_QUEST } from '../hooks/balance'
import { fillDuration, fillFrame } from '../hooks/fill'
import { classFor, levelFor, levelProgress, xpForLevel } from '../hooks/game'


// Stands in for the engine beneath the plugin. `ids` is the session id
// `$.session.id()` answers, read on each call so a test can move it; the
// store is a map the test reads back, and `lines` collects status lines.
function engine(
  on: On,
  {
    ids = { current: 's1' },
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
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  // The engine's own drawing of an output row: its text as is.
  on('ui.render', { component: 'CommandOutput' }, (_, e) => ({
    type: 'Text',
    children: [e.props.text],
  }))

  return store
}

// Long enough for any sheet's bar to finish filling.
const SETTLED_MS = 60_000

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
  const clock = mock.clock(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // Exactly the edits Artificer takes, each earning crafting's XP.
  const edits = CLASS_TARGETS.craft
  for (let i = 0; i < edits; i += 1) {
    await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b' })
  }
  const xp = edits * XP_PER_DEED.craft
  const level = levelFor(xp)
  const { gained, needed } = levelProgress({ xp, level })
  const filled = Math.round((gained / needed) * 20)

  for (const surface of ['terminal', 'desktop'] as const) {
    const { ui } = await questlog($, '', surface)
    await clock.advance(SETTLED_MS)

    expect((await ui.find({ type: 'Text', text: /^Level/ }))?.text).toBe(`Level ${level} Artificer`)
    expect((await ui.find({ type: 'Text', text: /^[█░]+$/ }))?.text).toBe(
      `${'█'.repeat(filled)}${'░'.repeat(20 - filled)}`,
    )
    expect((await ui.find({ type: 'Text', text: /XP$/ }))?.text).toBe(`${gained}/${needed} XP`)
    // The class's own deed is starred and bold.
    const crafted = await ui.find({ type: 'Text', text: /Crafted/ })
    expect(crafted?.text).toMatch(new RegExp(`^★ Crafted\\s+${edits} ▰{10}$`))
    expect(crafted?.props?.weight).toBe('bold')
    expect((await ui.find({ type: 'Text', text: /Battles/ }))?.text).toMatch(/^  Battles/)
    await ui.unmount()
  }
})

test('the sheet is a snapshot that reads as plain text too', async ($, on) => {
  engine(on)
  const clock = mock.clock(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const { text, ui } = await questlog($, '', 'desktop')
  await clock.advance(SETTLED_MS)
  await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b' })

  // Plain, it still reads as a sheet after the engine's "questlog: " label.
  expect(text).toMatch(/^⚔ \w+ · Level 1 Adventurer\n.* 0\/100 XP · \+0 XP\n/)
  expect(text).toMatch(/\nCrafted 0 · Battles 0 · Scouted 0 · Lore 0 · Summons 0\n/)
  // The row drawn earlier keeps what it showed.
  expect((await ui.find({ type: 'Text', text: /XP$/ }))?.text).toBe('0/100 XP')
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

  expect((await ui.find({ type: 'Text', text: /^Level/ }))?.text).toBe('Level 1 Adventurer')
  // An Adventurer has no class deed to star.
  expect((await ui.find({ type: 'Text', text: /Battles/ }))?.text).toMatch(/^  Battles\s+1\b/)
  expect(await ui.find({ type: 'Text', text: /★/ })).toBeUndefined()
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

  expect(text).toMatch(/Level 1 Adventurer/)
  await ui.unmount()
})

test('a resumed session gets its saved hero back', async ($, on) => {
  const saved = {
    sessionId: 's1',
    name: 'Dagny',
    heroClass: 'Berserker',
    level: 3,
    xp: 369,
    deeds: { craft: 0, battle: CLASS_TARGETS.battle + 10, scout: 0, lore: 2, summon: 0, misc: 1 },
    quests: 10,
    fumbles: 0,
  }
  const store = engine(on, { saved: { 'hero:s1': saved } })
  const clock = mock.clock(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const { text, ui } = await questlog($, '', 'desktop')
  await clock.advance(SETTLED_MS)
  // Saved as a Berserker, the class's name before it was renamed.
  expect(text).toMatch(/^⚔ Dagny · Level 3 Warrior\n/)
  expect((store.get('hero:s1') as { heroClass: string }).heroClass).toBe('Warrior')
  expect(text).toMatch(/\n█{5}░{15} 79\/300 XP · \+379 XP\n/)
  expect((await ui.find({ type: 'Text', text: /Dagny$/ }))?.text).toBe('⚔ Dagny')
  // 379 XP is 79 into level 3, which runs from 300 to 600.
  expect((await ui.find({ type: 'Text', text: /^[█░]+$/ }))?.text).toMatch(/^█{5}░{15}$/)
  expect((await ui.find({ type: 'Text', text: /XP$/ }))?.text).toBe('79/300 XP')
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

test('the desktop app\'s own tools are not lore', async ($, on) => {
  const store = engine(on)
  const call = (tool: string) =>
    $.tool.call({ tool } as Parameters<typeof $.tool.call>[0])
  const hero = () => store.get('hero:s1') as { xp: number; deeds: Record<string, number> }

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await call('mcp__ccd_turn__update_plan')
  expect(hero().xp).toBe(3)
  expect(hero().deeds.lore).toBe(0)
  expect(hero().deeds.misc).toBe(1)

  await call('mcp__slack__send_message')
  expect(hero().xp).toBe(11)
  expect(hero().deeds.lore).toBe(1)
})

test('other /questlog output is left as the engine draws it', async ($, on) => {
  engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const { ui } = await questlog($, 'status off', 'terminal')

  expect((await ui.find({ type: 'Text' }))?.text).toBe('Status line off.')
  await ui.unmount()
})

test('/questlog status turns the status line off and on', async ($, on) => {
  const lines: (string | undefined)[] = []
  engine(on, { lines })
  const run = (args: string) =>
    $.command.run({ command: 'questlog', args } as Parameters<typeof $.command.run>[0])

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(lines.at(-1)).toMatch(/Lv 1 Adventurer/)

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

test('/questlog help keeps the numbers back and the codex reveals them', async ($, on) => {
  engine(on)
  const run = async (args: string) =>
    (await $.command.run({ command: 'questlog', args } as Parameters<typeof $.command.run>[0])).text ?? ''
  const draw = (args: string, text: string, surface: 'terminal' | 'desktop') =>
    $.ui.mount({
      plugin: 'questlog',
      component: 'CommandOutput',
      props: { command: 'questlog', args, text: `questlog: ${text}`, isErrored: false },
      surface,
    })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const help = await run('help')
  const codex = await run('codex')

  // The help names what earns XP and points to the codex, with no numbers.
  expect(help).toMatch(/^Questlog turns .* finished turns are quests\.\n/)
  expect(help).toMatch(/crafting, battle, scouting, lore and summoning/)
  expect(help).toMatch(/\/questlog codex/)
  expect(help).toMatch(/\nNecromancer · from summoning\n/)
  expect(help).not.toMatch(/\d/)
  expect(help).not.toMatch(/Leveling/)

  // The codex has every amount, the class threshold and the formula.
  // Every number comes from balance.ts.
  expect(codex).toContain(`\nCrafting · ${XP_PER_DEED.craft} XP · Edit, Write, NotebookEdit\n`)
  expect(codex).toContain(`\nQuest · ${XP_PER_QUEST} XP · each finished turn\n`)
  expect(codex).toContain(`takes ${XP_PER_LEVEL_STEP} × L XP`)
  expect(codex).toContain(
    `\nLevel 3 · ${xpForLevel(3) - xpForLevel(2)} XP after level 2 · ${xpForLevel(3)} XP in all\n`,
  )
  expect(codex).toContain(`\nNecromancer · summoning · ${CLASS_TARGETS.summon} deeds\n`)
  expect(codex).toContain(`\nRanger · scouting · ${CLASS_TARGETS.scout} deeds\n`)
  for (const text of [help, codex]) {
    expect(text).not.toMatch(/  /)
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    const short = await draw('help', help, surface)
    for (const heading of ['Earning XP', 'Classes', 'Commands']) {
      expect((await short.find({ type: 'Text', text: heading }))?.props?.weight).toBe('bold')
    }
    expect(await short.find({ type: 'Text', text: `${XP_PER_DEED.craft} XP` })).toBeUndefined()
    expect(await short.find({ type: 'Text', text: 'Leveling' })).toBeUndefined()
    expect(await short.find({ type: 'Text', text: /questlog:/ })).toBeUndefined()
    await short.unmount()

    const full = await draw('codex', codex, surface)
    expect((await full.find({ type: 'Text', text: 'Leveling' }))?.props?.weight).toBe('bold')
    expect(await full.find({ type: 'Text', text: `${XP_PER_DEED.craft} XP` })).toBeDefined()
    // Commands are drawn in a code font; other first columns are not.
    expect((await full.find({ type: 'Text', text: '/questlog codex' }))?.props?.mono).toBe(true)
    expect((await full.find({ type: 'Text', text: 'Crafting' }))?.props?.mono).toBeUndefined()
    await full.unmount()
  }

  // Reading the rules earns nothing and leaves the hero as it was.
  expect(await run('')).toMatch(/Level 1 Adventurer\n.* 0\/100 XP/)
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
  expect(lines.at(-1)).toMatch(/^⚔ Sir Lance lot · Lv 1 Adventurer/)
  expect(await run('')).toMatch(/^⚔ Sir Lance lot · Level 1 Adventurer\n/)
  expect(before).not.toBe('Sir Lance lot')

  expect(await run('rename')).toBe('Usage: /questlog rename <name>')
  expect(await run('rename ' + 'x'.repeat(25))).toBe("A hero's name can be at most 24 characters.")
  expect((store.get('hero:s1') as { name: string; xp: number }).xp).toBe(0)
})

test('a sheet printed under a former class name still draws', async ($, on) => {
  engine(on)
  const text = [
    'questlog: ⚔ Ulla · Level 6 Berserker',
    '█░░░░░░░░░░░░░░░░░░░ 20/600 XP',
    'Crafted 12 · Battles 54 · Scouted 0 · Lore 34 · Summons 0',
    'Quests 20 · Fumbles 5',
  ].join('\n')
  const ui = await $.ui.mount({
    plugin: 'questlog',
    component: 'CommandOutput',
    props: { command: 'questlog', args: '', text, isErrored: false },
    surface: 'desktop',
  })

  // It keeps the name it was printed with.
  expect((await ui.find({ type: 'Text', text: /^Level/ }))?.text).toBe('Level 6 Berserker')
  // Its class deed is starred under the class's new name, Warrior.
  expect((await ui.find({ type: 'Text', text: /★/ }))?.text).toMatch(/^★ Battles/)
  await ui.unmount()
})

test('the class is the kind of deed furthest along on its target', () => {
  const deeds = (counts: Partial<Record<'craft' | 'battle' | 'scout' | 'lore' | 'summon', number>>) => ({
    craft: 0,
    battle: 0,
    scout: 0,
    lore: 0,
    summon: 0,
    misc: 0,
    ...counts,
  })
  const { scout, battle, craft, summon } = CLASS_TARGETS

  // An Adventurer until some kind reaches its target, however many deeds.
  expect(classFor(deeds({ scout: scout - 1, battle: battle - 1, craft: craft - 1 }))).toBe('Adventurer')
  expect(classFor(deeds({ scout }))).toBe('Ranger')

  // A rare kind wins on far fewer deeds: progress, not the count, decides.
  expect(classFor(deeds({ scout: scout + 1, summon: summon * 2 }))).toBe('Necromancer')
  expect(scout + 1).toBeGreaterThan(summon * 2)

  // On a tie the hero keeps the class they have.
  const tied = deeds({ scout, battle })
  expect(classFor(tied, 'Warrior')).toBe('Warrior')
  expect(classFor(tied, 'Ranger')).toBe('Ranger')
})

test('the bar fills at a pace set by how much was gained', () => {
  const at = (from: number, to: number, ms: number) => {
    const frame = fillFrame(from, to, ms)

    return frame && [frame.level, frame.gained, frame.needed, frame.left, frame.isLevelUp]
  }

  // Nothing gained: +0 XP for two seconds, then the sheet as it stands.
  expect(at(50, 50, 0)).toEqual([1, 50, 100, 0, false])
  expect(at(50, 50, 1999)).toEqual([1, 50, 100, 0, false])
  expect(at(50, 50, 2000)).toBeUndefined()

  // Under a tenth of the bar fills in a second, more in two, the counter
  // draining as the bar rises; then +0 XP for two seconds.
  expect(at(0, 8, 500)).toEqual([1, 4, 100, 4, false])
  expect(at(0, 8, 1000)).toEqual([1, 8, 100, 0, false])
  expect(fillDuration(0, 8)).toBe(3000)
  expect(at(0, 50, 1000)).toEqual([1, 25, 100, 25, false])
  // Every fill eases in and out: slow at either end, quick in the middle.
  expect(at(0, 50, 500)).toEqual([1, 3, 100, 47, false])
  expect(at(0, 50, 1500)).toEqual([1, 47, 100, 3, false])
  expect(fillDuration(0, 50)).toBe(4000)

  // One level up: the old bar at its own pace, two seconds on the level up
  // with that bar full, then the new bar at its own.
  expect(at(50, 150, 1000)).toEqual([1, 75, 100, 75, false])
  expect(at(50, 150, 2000)).toEqual([2, 100, 100, 50, true])
  expect(at(50, 150, 4000)).toEqual([2, 0, 200, 50, false])
  expect(at(50, 150, 5000)).toEqual([2, 25, 200, 25, false])
  expect(fillDuration(50, 150)).toBe(8000)
  expect(fillDuration(95, 110)).toBe(1000 + 2000 + 1000 + 2000)

  // Several: every completed level in four seconds, the pause, then the
  // current level at its own pace.
  expect(at(0, 350, 2000)).toEqual([2, 50, 200, 200, false])
  expect(at(0, 350, 4000)).toEqual([3, 200, 200, 50, true])
  expect(at(0, 350, 6000)).toEqual([3, 0, 300, 50, false])
  expect(fillDuration(0, 350)).toBe(4000 + 2000 + 2000 + 2000)
})

test('the newest sheet fills its bar from what the last one showed', async ($, on) => {
  engine(on)
  on('turn.complete', () => ({ text: '' }))
  const clock = mock.clock(on)
  const sheetRow = (text: string, requestId: string) =>
    $.ui.mount({
      plugin: 'questlog',
      component: 'CommandOutput',
      requestId,
      props: { command: 'questlog', args: '', text, isErrored: false },
      surface: 'terminal',
    })
  // The XP figure, after the counter above it while there is one.
  const xpLine = async (ui: Awaited<ReturnType<typeof sheetRow>>) => {
    const counter = (await ui.find({ type: 'Text', text: /^\+\d+ XP$/ }))?.text
    const figure = (await ui.find({ type: 'Text', text: /^\d+\/\d+ XP/ }))?.text

    return counter === undefined ? figure : `${figure} ${counter}`
  }
  const run = async () =>
    (await $.command.run({ command: 'questlog', args: '' } as Parameters<typeof $.command.run>[0])).text ?? ''

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const first = await sheetRow(await run(), 'r1')
  expect(await xpLine(first)).toBe('0/100 XP +0 XP')
  await clock.advance(2000)
  expect(await xpLine(first)).toBe('0/100 XP')

  // A finished turn's XP since: the text says it, and the bar fills with it.
  await $.turn.complete({ answer: 'Done.', durationMs: 0, isAborted: false, turnId: 't1', reason: 'answer' })
  const text = await run()
  expect(text).toMatch(new RegExp(` ${XP_PER_QUEST}/100 XP · \\+${XP_PER_QUEST} XP\\n`))
  const second = await sheetRow(text, 'r2')
  expect(await xpLine(second)).toBe(`0/100 XP +${XP_PER_QUEST} XP`)
  await clock.advance(1000)
  const half = Math.round(XP_PER_QUEST / 2)
  expect(await xpLine(second)).toBe(`${half}/100 XP +${XP_PER_QUEST - half} XP`)
  // The older sheet stays as it was.
  expect(await xpLine(first)).toBe('0/100 XP')
  await clock.advance(3000)
  expect(await xpLine(second)).toBe(`${XP_PER_QUEST}/100 XP`)

  // A sheet printed before sheets told the gain draws as it stands.
  const old = await sheetRow('⚔ Ulla · Level 1 Adventurer\n█████░░░░░░░░░░░░░░░ 25/100 XP\nQuests 1 · Fumbles 0', 'r3')
  expect(await xpLine(old)).toBe('25/100 XP')
})
