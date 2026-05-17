export type RgbColor = {
  red: number
  green: number
  blue: number
}

export type RgbaColor = RgbColor & {
  alpha: number
}

// Display-P3 to linear-sRGB conversion matrix (CSS Color Module 4).
const DISPLAY_P3_TO_LINEAR_SRGB: readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
] = [
  [1.22494012031297, -0.22494012031297, 0],
  [-0.04205697776655, 1.04205697776655, 0],
  [-0.01963755459483, -0.07863604555064, 1.09827360014546],
]

const DISPLAY_P3_PATTERN =
  /^color\(\s*display-p3\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.eE+-]+))?\s*\)$/

export function parseColor(input: string): RgbaColor | undefined {
  const trimmed = input.trim()
  return parseHex(trimmed) ?? parseDisplayP3(trimmed)
}

function parseHex(input: string): RgbaColor | undefined {
  if (!input.startsWith("#")) {
    return undefined
  }
  const hex = input.slice(1)

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const [r, g, b] = hex
    return {
      red: Number.parseInt(`${r}${r}`, 16),
      green: Number.parseInt(`${g}${g}`, 16),
      blue: Number.parseInt(`${b}${b}`, 16),
      alpha: 1,
    }
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
      alpha: 1,
    }
  }

  if (/^[0-9a-fA-F]{8}$/.test(hex)) {
    return {
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
      alpha: Number.parseInt(hex.slice(6, 8), 16) / 255,
    }
  }

  return undefined
}

function parseDisplayP3(input: string): RgbaColor | undefined {
  const match = DISPLAY_P3_PATTERN.exec(input)
  if (match == null) {
    return undefined
  }

  const p3 = [Number(match[1]), Number(match[2]), Number(match[3])] as const
  const alpha = match[4] != null ? Number(match[4]) : 1
  if (
    Number.isNaN(p3[0]) ||
    Number.isNaN(p3[1]) ||
    Number.isNaN(p3[2]) ||
    Number.isNaN(alpha)
  ) {
    return undefined
  }

  const linearP3 = p3.map(srgbToLinear) as [number, number, number]
  const linearSrgb = DISPLAY_P3_TO_LINEAR_SRGB.map(
    (row) => row[0] * linearP3[0] + row[1] * linearP3[1] + row[2] * linearP3[2],
  ) as [number, number, number]
  const srgb = linearSrgb
    .map((value) => Math.max(0, Math.min(1, value)))
    .map(linearToSrgb) as [number, number, number]

  return {
    red: Math.round(srgb[0] * 255),
    green: Math.round(srgb[1] * 255),
    blue: Math.round(srgb[2] * 255),
    alpha,
  }
}

function srgbToLinear(component: number): number {
  return component <= 0.04045
    ? component / 12.92
    : ((component + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(component: number): number {
  return component <= 0.0031308
    ? 12.92 * component
    : 1.055 * component ** (1 / 2.4) - 0.055
}
