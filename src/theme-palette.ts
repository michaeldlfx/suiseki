import type { BundledTheme, Highlighter } from "shiki"

export type ThemePalette = {
  foreground: string
  dimmed: string
  addition: string
  deletion: string
  accent: string
  additionBackground: string
  additionInlineBackground: string
  deletionBackground: string
  deletionInlineBackground: string
  separatorForeground: string
  separatorBackground: string
}

type ResolveThemePaletteParams = {
  highlighter: Highlighter
  theme: BundledTheme
}

type RgbaColor = {
  red: number
  green: number
  blue: number
  alpha: number
}

const DARK_FALLBACKS = {
  addition: "#3fb950",
  deletion: "#f85149",
  accent: "#d2a8ff",
}

const LIGHT_FALLBACKS = {
  addition: "#1a7f37",
  deletion: "#cf222e",
  accent: "#8250df",
}

export function resolveThemePalette({
  highlighter,
  theme,
}: ResolveThemePaletteParams): ThemePalette {
  const resolvedTheme = highlighter.getTheme(theme)
  const foreground = resolvedTheme.fg
  const background = resolvedTheme.bg
  const isDark = resolvedTheme.type === "dark"
  const colors = resolvedTheme.colors ?? {}
  const fallbacks = isDark ? DARK_FALLBACKS : LIGHT_FALLBACKS

  const addition = colors["terminal.ansiGreen"] ?? fallbacks.addition
  const deletion = colors["terminal.ansiRed"] ?? fallbacks.deletion
  const accent = colors["terminal.ansiMagenta"] ?? fallbacks.accent

  const dimmedFromTheme = colors["editorLineNumber.foreground"]
  const dimmed =
    dimmedFromTheme != null
      ? compositeOver(dimmedFromTheme, background)
      : blendColors(foreground, background, 0.5)

  const additionBgFromTheme = colors["diffEditor.insertedTextBackground"]
  const additionBackground =
    additionBgFromTheme != null
      ? compositeOver(additionBgFromTheme, background)
      : blendColors(background, addition, 0.15)
  const additionInlineBackground = blendColors(
    additionBackground,
    addition,
    0.3,
  )

  const deletionBgFromTheme = colors["diffEditor.removedTextBackground"]
  const deletionBackground =
    deletionBgFromTheme != null
      ? compositeOver(deletionBgFromTheme, background)
      : blendColors(background, deletion, 0.15)
  const deletionInlineBackground = blendColors(
    deletionBackground,
    deletion,
    0.3,
  )

  const separatorForeground = blendColors(foreground, background, 0.35)
  const separatorBackground = blendColors(background, foreground, 0.12)

  return {
    foreground,
    dimmed,
    addition,
    deletion,
    accent,
    additionBackground,
    additionInlineBackground,
    deletionBackground,
    deletionInlineBackground,
    separatorForeground,
    separatorBackground,
  }
}

function parseHexToRgba(hex: string): RgbaColor | undefined {
  const normalized = hex.replace("#", "")

  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    const [r, g, b] = normalized
    return {
      red: Number.parseInt(`${r}${r}`, 16),
      green: Number.parseInt(`${g}${g}`, 16),
      blue: Number.parseInt(`${b}${b}`, 16),
      alpha: 1,
    }
  }

  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return {
      red: Number.parseInt(normalized.slice(0, 2), 16),
      green: Number.parseInt(normalized.slice(2, 4), 16),
      blue: Number.parseInt(normalized.slice(4, 6), 16),
      alpha: 1,
    }
  }

  if (/^[0-9a-fA-F]{8}$/.test(normalized)) {
    return {
      red: Number.parseInt(normalized.slice(0, 2), 16),
      green: Number.parseInt(normalized.slice(2, 4), 16),
      blue: Number.parseInt(normalized.slice(4, 6), 16),
      alpha: Number.parseInt(normalized.slice(6, 8), 16) / 255,
    }
  }

  return undefined
}

function rgbToHex(red: number, green: number, blue: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

  return `#${clamp(red).toString(16).padStart(2, "0")}${clamp(green).toString(16).padStart(2, "0")}${clamp(blue).toString(16).padStart(2, "0")}`
}

function blendColors(color1: string, color2: string, ratio: number): string {
  const parsed1 = parseHexToRgba(color1)
  const parsed2 = parseHexToRgba(color2)

  if (parsed1 == null || parsed2 == null) {
    return color1
  }

  return rgbToHex(
    parsed1.red + (parsed2.red - parsed1.red) * ratio,
    parsed1.green + (parsed2.green - parsed1.green) * ratio,
    parsed1.blue + (parsed2.blue - parsed1.blue) * ratio,
  )
}

function compositeOver(foreground: string, background: string): string {
  const fg = parseHexToRgba(foreground)
  const bg = parseHexToRgba(background)

  if (fg == null || bg == null) {
    return foreground
  }

  if (fg.alpha >= 1) {
    return rgbToHex(fg.red, fg.green, fg.blue)
  }

  return rgbToHex(
    fg.red * fg.alpha + bg.red * (1 - fg.alpha),
    fg.green * fg.alpha + bg.green * (1 - fg.alpha),
    fg.blue * fg.alpha + bg.blue * (1 - fg.alpha),
  )
}
