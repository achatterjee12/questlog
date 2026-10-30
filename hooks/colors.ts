// Color math for the drawn sheet. Colors are 0xRRGGBB
// numbers until `hex` turns one into the string a Text's color takes.

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
