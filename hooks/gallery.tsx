// A showcase of what a pane can draw: colors, styles, gradients, animation,
// borders, hover and pixel art. Opened by /questlog gallery.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

export const GALLERY = 'questlog-gallery'
const TITLE = 'Questlog gallery'
// Ticks while the gallery is open; every animation is drawn from it.
const tick = atom({ plugin: 'questlog', key: 'galleryTick' } as const, 0)
const TICK_MS = 100

let ticker: Timer | undefined

export async function openGallery($: EngineInterface) {
  const opened = await $.ui.open({ id: GALLERY, title: TITLE })
  ticker ??= $.clock.every(TICK_MS, () => {
    void update($, tick, n => n + 1)
  })

  return opened
}

function stopTicking() {
  ticker?.cancel()
  ticker = undefined
}

// Hue 0-360 at full saturation to #rrggbb, and to 0xRRGGBB for a Raster.
function hueRgb(hue: number, lightness = 0.6): number {
  const h = (((hue % 360) + 360) % 360) / 60
  const c = (1 - Math.abs(2 * lightness - 1)) * 0.9
  const x = c * (1 - Math.abs((h % 2) - 1))
  const [r, g, b] =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
  const m = lightness - c / 2
  const to = (v: number) => Math.round((v + m) * 255)

  return (to(r) << 16) | (to(g) << 8) | to(b)
}

function hex(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, '0')}`
}

function mix(from: number, to: number, t: number): number {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff

    return Math.round(a + (b - a) * t) << shift
  }

  return channel(16) | channel(8) | channel(0)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }

  return out
}

// A drifting plasma, two pixels per cell: '▀' paints the top pixel in the
// foreground and the bottom one in the background.
function plasmaCells(columns: number, rows: number, t: number): string {
  const words = new Uint32Array(columns * rows * 3)
  const at = (x: number, y: number) => {
    const v =
      Math.sin(x / 5 + t / 4) + Math.sin(y / 3 + t / 6) + Math.sin((x + y) / 7 + t / 5)

    return hueRgb(v * 60 + t * 4, 0.5)
  }
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const i = (y * columns + x) * 3
      words[i] = 0x2580
      words[i + 1] = at(x, y * 2)
      words[i + 2] = at(x, y * 2 + 1)
    }
  }

  return base64(new Uint8Array(words.buffer))
}

// The same idea for the surfaces without Raster: an SVG the surface animates
// by itself.
const SHIMMER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="56" viewBox="0 0 320 56">
  <defs>
    <linearGradient id="g" x1="0" x2="1">
      <stop offset="0" stop-color="#ff5f6d"><animate attributeName="stop-color" values="#ff5f6d;#ffc371;#47e6b1;#5b8cff;#ff5f6d" dur="4s" repeatCount="indefinite"/></stop>
      <stop offset="1" stop-color="#5b8cff"><animate attributeName="stop-color" values="#5b8cff;#ff5f6d;#ffc371;#47e6b1;#5b8cff" dur="4s" repeatCount="indefinite"/></stop>
    </linearGradient>
  </defs>
  <rect width="320" height="56" rx="10" fill="url(#g)"/>
  <text x="160" y="37" text-anchor="middle" font-family="ui-monospace, monospace" font-size="24" font-weight="700" fill="#fff">⚔ QUESTLOG ⚔</text>
  <circle cx="20" cy="28" r="5" fill="#fff"><animate attributeName="cx" values="20;300;20" dur="3s" repeatCount="indefinite"/></circle>
</svg>`

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const BORDERS = ['single', 'double', 'round', 'bold', 'dashed', 'classic'] as const
const THEME_KEYS = ['claude', 'success', 'warning', 'error', 'suggestion', 'planMode', 'permission'] as const

export function registerGallery(on: On) {
  on('ui.close', async ($, e, next) => {
    if (e.id === GALLERY) {
      stopTicking()
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: GALLERY }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const t = await read($, tick)
    const width = Math.max(16, Math.min(48, e.props.bodyColumns - 2))

    const gradient = (text: string, from: number, to: number) =>
      [...text].map((ch, i, all) => (
        <Text color={hex(mix(from, to, i / Math.max(1, all.length - 1)))}>{ch}</Text>
      ))
    const rainbow = (text: string, shift: number) =>
      [...text].map((ch, i) => <Text color={hex(hueRgb(i * 18 + shift))}>{ch}</Text>)
    const heading = (text: string) => (
      <Text weight="bold" color="claude">
        {text}
      </Text>
    )

    // A light sweeping across, brightest where the wave is.
    const shimmer = [...'Sauteing your quest log...'].map((ch, i, all) => {
      const pos = (t % (all.length + 10)) - 5
      const glow = Math.max(0, 1 - Math.abs(i - pos) / 4)

      return <Text color={hex(mix(0x777777, 0xffe08a, glow))}>{ch}</Text>
    })
    // The terminal paints cells; the desktop, editor and phone draw SVG.
    let pixels
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve({ ...e, surface: 'terminal' as const })
      pixels = <Raster key="plasma" columns={width} rows={6} cells={plasmaCells(width, 6, t)} />
    } else {
      const { Svg } = $.ui.resolve({ ...e, surface: e.surface })
      pixels = <Svg source={SHIMMER_SVG} alt="An animated rainbow Questlog banner" isInteractive />
    }

    const pulse = (Math.sin(t / 3) + 1) / 2
    const fill = (t % 40) / 39
    const filled = Math.round(fill * width)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {heading('Colors')}
          <Text>
            {THEME_KEYS.map(key => (
              <Text color={key}>{key} </Text>
            ))}
          </Text>
          <Text>
            <Text color="#ff5f6d">#ff5f6d </Text>
            <Text color="#ffc371">#ffc371 </Text>
            <Text color="#47e6b1">#47e6b1 </Text>
            <Text color="#5b8cff">#5b8cff</Text>
          </Text>
          <Text>
            <Text backgroundColor="#5b2a86" color="#fff">
              {' on purple '}
            </Text>{' '}
            <Text backgroundColor="success" color="inverseText">
              {' on success '}
            </Text>
          </Text>
        </Box>

        <Box flexDirection="column">
          {heading('Styles')}
          <Text>
            <Text weight="bold">bold</Text> <Text italic>italic</Text>{' '}
            <Text underline>underline</Text> <Text strikethrough>struck</Text>{' '}
            <Text inverse>inverse</Text> <Text dimColor>dim</Text>
          </Text>
        </Box>

        <Box flexDirection="column">
          {heading('Gradients')}
          <Text weight="bold">{gradient('⚔ Questlog: a hero is born', 0xff5f6d, 0xffc371)}</Text>
          <Text>{gradient('▰'.repeat(width), 0x47e6b1, 0x5b8cff)}</Text>
          <Text>{rainbow('Every color of the rainbow, in order', 0)}</Text>
        </Box>

        <Box flexDirection="column">
          {heading('Animated')}
          <Text weight="bold">{rainbow('✦ Level up! ✦ Level up! ✦', t * 12)}</Text>
          <Text>{shimmer}</Text>
          <Text>
            <Text color="claude">{SPINNER[t % SPINNER.length]}</Text> Summoning a subagent
          </Text>
          <Text color={hex(mix(0x5a1e1e, 0xff4d4d, pulse))} weight="bold">
            ♥ Low health ♥
          </Text>
          <Text>
            {gradient('█'.repeat(filled), 0xffc371, 0xff5f6d)}
            <Text dimColor>{'░'.repeat(width - filled)}</Text> {Math.round(fill * 100)}%
          </Text>
        </Box>

        <Box flexDirection="column">
          {heading('Borders')}
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {BORDERS.map((style, i) => (
              <Box borderStyle={style} borderColor={hex(hueRgb(i * 60))} paddingX={1}>
                <Text>{style}</Text>
              </Box>
            ))}
          </Box>
        </Box>

        <Box flexDirection="column">
          {heading('Hover')}
          <Box
            key="hover-card"
            borderStyle="round"
            borderDimColor
            paddingX={1}
            flexDirection="column"
            hover={{ borderColor: 'claude', borderStyle: 'bold' }}
          >
            <Text hover={{ color: 'claude', bold: true }}>Point at this card</Text>
            <Box display="none" hover={{ display: 'flex' }}>
              <Text color="success">…and a secret line appears ✨</Text>
            </Box>
          </Box>
        </Box>

        <Box flexDirection="column">
          {heading('Pixels')}
          {pixels}
        </Box>
      </Box>
    )
  })
}
