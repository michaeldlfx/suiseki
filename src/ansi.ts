import type { ThemedToken } from "shiki"
import { parseColor } from "./color"

export const RESET = "\x1b[0m"
const ANSI_ESCAPE = String.fromCharCode(27)
const ANSI_ESCAPE_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, "g")

const FONT_STYLE = {
  italic: 1,
  bold: 2,
  underline: 4,
  strikethrough: 8,
}

type ColorTuple = [red: number, green: number, blue: number]

type AnsiStyleParams = {
  backgroundColor?: string
  bold?: boolean
  foregroundColor?: string
  italic?: boolean
  strikethrough?: boolean
  underline?: boolean
}

type EmitStyledTextParams = AnsiStyleParams & {
  text: string
}

type EmitTokenParams = {
  backgroundColor?: string
  token: ThemedToken
}

type EmitPaddingParams = {
  backgroundColor?: string
  visibleLength: number
  width: number
}

export function emitStyledText({
  text,
  ...styleParams
}: EmitStyledTextParams): string {
  return `${createAnsiStyle(styleParams)}${text}${RESET}`
}

export function emitToken({ token, backgroundColor }: EmitTokenParams): string {
  return emitStyledText({
    text: token.content,
    foregroundColor: token.color,
    backgroundColor,
    bold: hasFontStyle(token.fontStyle, FONT_STYLE.bold),
    italic: hasFontStyle(token.fontStyle, FONT_STYLE.italic),
    underline: hasFontStyle(token.fontStyle, FONT_STYLE.underline),
    strikethrough: hasFontStyle(token.fontStyle, FONT_STYLE.strikethrough),
  })
}

export function emitPadding({
  backgroundColor,
  visibleLength,
  width,
}: EmitPaddingParams): string {
  const paddingLength = Math.max(width - visibleLength, 0)

  if (paddingLength === 0 || backgroundColor == null) {
    return RESET
  }

  return emitStyledText({
    text: " ".repeat(paddingLength),
    backgroundColor,
  })
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "")
}

export function visibleWidth(value: string): number {
  return stripAnsi(value).length
}

// Fit an ANSI string to a target visible width for a fixed-width column: copy
// SGR escapes without counting them, truncate when the visible budget runs out
// (closing with a reset), and optionally pad short lines with trailing spaces.
export function fitToWidth(value: string, width: number, pad = true): string {
  let visible = 0
  let result = ""
  let index = 0
  let truncated = false

  while (index < value.length) {
    if (value[index] === ANSI_ESCAPE && value[index + 1] === "[") {
      const escapeEnd = value.indexOf("m", index)
      if (escapeEnd === -1) {
        result += value.slice(index)
        break
      }
      result += value.slice(index, escapeEnd + 1)
      index = escapeEnd + 1
      continue
    }

    if (visible >= width) {
      truncated = true
      break
    }
    result += value[index]
    visible++
    index++
  }

  if (truncated) {
    result += RESET
  }
  if (pad && visible < width) {
    result += " ".repeat(width - visible)
  }
  return result
}

function createAnsiStyle({
  backgroundColor,
  bold,
  foregroundColor,
  italic,
  strikethrough,
  underline,
}: AnsiStyleParams): string {
  const styleCodes: string[] = []
  const foregroundColorTuple =
    foregroundColor == null ? undefined : parseHexColor(foregroundColor)
  const backgroundColorTuple =
    backgroundColor == null ? undefined : parseHexColor(backgroundColor)

  if (foregroundColorTuple != null) {
    styleCodes.push(createColorCode("38", foregroundColorTuple))
  }

  if (backgroundColorTuple != null) {
    styleCodes.push(createColorCode("48", backgroundColorTuple))
  }

  if (bold === true) {
    styleCodes.push("1")
  }

  if (italic === true) {
    styleCodes.push("3")
  }

  if (underline === true) {
    styleCodes.push("4")
  }

  if (strikethrough === true) {
    styleCodes.push("9")
  }

  return styleCodes.length === 0 ? "" : `\x1b[${styleCodes.join(";")}m`
}

function createColorCode(
  mode: "38" | "48",
  [red, green, blue]: ColorTuple,
): string {
  return `${mode};2;${red};${green};${blue}`
}

function parseHexColor(color: string): ColorTuple | undefined {
  const parsed = parseColor(color)
  return parsed == null ? undefined : [parsed.red, parsed.green, parsed.blue]
}

function hasFontStyle(
  fontStyle: ThemedToken["fontStyle"],
  expectedStyle: number,
): boolean {
  return fontStyle != null && (fontStyle & expectedStyle) !== 0
}
