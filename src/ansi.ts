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

// Display width of a single code point in terminal cells: 0 for combining marks
// and zero-width characters, 2 for East Asian wide/fullwidth characters and most
// emoji, 1 otherwise. A wcwidth-style approximation (not a full Unicode table),
// enough to keep the fixed-width `--with-tree` columns aligned when content is
// not plain ASCII.
function codePointWidth(codePoint: number): number {
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) || // combining diacritics
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) || // combining extended
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) || // combining supplement
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) || // combining for symbols
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || // variation selectors
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) || // combining half marks
    codePoint === 0x200b || // zero-width space
    codePoint === 0x200c || // zero-width non-joiner
    codePoint === 0x200d || // zero-width joiner
    codePoint === 0xfeff // zero-width no-break space / BOM
  ) {
    return 0
  }

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0x303e) || // CJK radicals .. symbols
    (codePoint >= 0x3041 && codePoint <= 0x33ff) || // Hiragana .. CJK compat
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK Extension A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) || // Yi
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul Syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK Compatibility Ideographs
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) || // CJK Compatibility Forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // Fullwidth Forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) || // Fullwidth signs
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) || // emoji & pictographs
    (codePoint >= 0x20000 && codePoint <= 0x3fffd) // CJK Extension B and beyond
  ) {
    return 2
  }

  return 1
}

// Visible terminal width of an ANSI string: escapes are ignored, and each code
// point contributes its display-cell width (see codePointWidth).
export function visibleWidth(value: string): number {
  let width = 0
  for (const character of stripAnsi(value)) {
    width += codePointWidth(character.codePointAt(0) ?? 0)
  }
  return width
}

// Fit an ANSI string to a target display width for a fixed-width column: copy
// SGR escapes without counting them, measure content by display cells (so CJK
// and emoji count as two), stop before a character that would overflow the
// column (closing with a reset), and optionally pad short lines with trailing
// spaces. A wide character that no longer fits is dropped and the leftover cell
// is padded, so the column never overflows.
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

    // Read a full code point so surrogate pairs are never split.
    const codePoint = value.codePointAt(index) ?? 0
    const character = String.fromCodePoint(codePoint)
    const characterWidth = codePointWidth(codePoint)

    if (visible + characterWidth > width) {
      truncated = true
      break
    }
    result += character
    visible += characterWidth
    index += character.length
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
