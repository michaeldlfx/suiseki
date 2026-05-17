import type { Highlighter } from "shiki"
import { parseColor } from "./color"

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
  colorsOverride?: Record<string, string>
  highlighter: Highlighter
  theme: string
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
  colorsOverride,
  highlighter,
  theme,
}: ResolveThemePaletteParams): ThemePalette {
  const resolvedTheme = highlighter.getTheme(theme)
  const foreground = resolvedTheme.fg
  const background = resolvedTheme.bg
  const isDark = resolvedTheme.type === "dark"
  const colors = colorsOverride ?? resolvedTheme.colors ?? {}
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

function rgbToHex(red: number, green: number, blue: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

  return `#${clamp(red).toString(16).padStart(2, "0")}${clamp(green).toString(16).padStart(2, "0")}${clamp(blue).toString(16).padStart(2, "0")}`
}

function blendColors(color1: string, color2: string, ratio: number): string {
  const parsed1 = parseColor(color1)
  const parsed2 = parseColor(color2)

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
  const fg = parseColor(foreground)
  const bg = parseColor(background)

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
