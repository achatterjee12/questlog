// /questlog help drawn with bold headings and real columns. The command
// prints plain text; this hook recognizes it and draws the same sections,
// sizing each column to its widest cell instead of padding with spaces.
import type { On } from 'claude-code'

import { HELP_INTRO, helpSections } from './game'

export function registerHelp(on: On) {
  on('ui.render', { component: 'CommandOutput', props: { command: 'questlog' } }, async ($, e, next) => {
    if (e.props.isErrored || !e.props.text.includes(HELP_INTRO)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" gap={1}>
        <Text>{HELP_INTRO}</Text>
        {helpSections().map(({ heading, note, rows }) => {
          const columns = Math.max(...rows.map(cells => cells.length))
          const widths = Array.from(
            { length: columns },
            (_, i) => Math.max(...rows.map(cells => [...(cells[i] ?? '')].length)) + 2,
          )

          return (
            <Box flexDirection="column">
              <Text weight="bold" color="claude">
                {heading}
              </Text>
              {note === undefined ? null : <Text>{note}</Text>}
              {rows.map(cells => (
                <Box flexDirection="row">
                  {cells.map((cell, i) =>
                    i === cells.length - 1 ? (
                      <Text dimColor={i > 0}>{cell}</Text>
                    ) : (
                      <Box width={widths[i]} flexShrink={0}>
                        <Text color={i === 0 ? 'text' : 'success'}>{cell}</Text>
                      </Box>
                    ),
                  )}
                </Box>
              ))}
            </Box>
          )
        })}
      </Box>
    )
  })
}
