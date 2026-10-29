// Color math shared by the sheet and the gallery. Colors are 0xRRGGBB
// numbers until `hex` turns one into the string a Text's color takes.

// A hue in degrees, at the given lightness, to 0xRRGGBB.
export function hueRgb(hue: number, lightness = 0.6): number {
  const h = (((hue % 360) + 360) % 360) / 60
  const c = (1 - Math.abs(2 * lightness - 1)) * 0.9
  const x = c * (1 - Math.abs((h % 2) - 1))
  const [r, g, b] =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
  const m = lightness - c / 2
  const to = (v: number) => Math.round((v + m) * 255)

  return (to(r) << 16) | (to(g) << 8) | to(b)
}

export function hex(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, '0')}`
}

// The color `t` of the way from `from` to `to`, `t` from 0 to 1.
export function mix(from: number, to: number, t: number): number {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff

    return Math.round(a + (b - a) * t) << shift
  }

  return channel(16) | channel(8) | channel(0)
}

// The color of each character of `text`, fading from `from` to `to`.
export function gradientColors(text: string, from: number, to: number): [string, string][] {
  const chars = [...text]

  return chars.map((ch, i) => [ch, hex(mix(from, to, i / Math.max(1, chars.length - 1)))])
}
