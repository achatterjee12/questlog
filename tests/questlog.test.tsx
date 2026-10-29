import { expect, mock, test } from 'claude-code/testing'

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

test('deeds earn XP, a class and levels, on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'questlog' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

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

test('/questlog prints the sheet when the pane cannot be shown', async ($, on) => {
  on('command.register', () => ({ value: { command: 'questlog' } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'too narrow' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'questlog', args: '' } as Parameters<typeof $.command.run>[0])

  expect(ran.text).toMatch(/Level 1 Novice/)
  expect(ran.text).toMatch(/Pane not shown: too narrow/)
})

test('/questlog status turns the status line off and on', async ($, on) => {
  mock.store(on)
  const lines: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    lines.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'questlog' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
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
