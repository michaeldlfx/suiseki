import { getFiletypeFromFileName } from "@pierre/diffs"
import {
  type BundledLanguage,
  type BundledTheme,
  bundledLanguages,
  getSingletonHighlighter,
  type Highlighter,
  type SpecialLanguage,
  type ThemedToken,
  type ThemeRegistrationRaw,
} from "shiki"
import { emitToken } from "../ansi"
import { isBundledThemeName, type SuisekiConfig } from "../config"
import type { CustomThemes } from "../custom-themes"
import { isPierreThemeName, PIERRE_THEMES } from "../pierre-themes"
import { resolveThemePalette, type ThemePalette } from "../theme-palette"

const DEFAULT_TERMINAL_WIDTH = 100

export type RenderLanguage = BundledLanguage | SpecialLanguage

export type InlineHighlightRange = {
  end: number
  start: number
}

export type RenderContext = {
  highlighter: Highlighter
  palette: ThemePalette
  terminalWidth: number
  themeName: string
}

type RenderTokenizedContentParams = {
  backgroundColor?: string
  content: string
  highlighter: Highlighter
  inlineBackgroundColor?: string
  inlineHighlightRanges: InlineHighlightRange[]
  language: RenderLanguage
  maxLineLength: number
  theme: string
}

type RenderTokenWithInlineHighlightsParams = {
  backgroundColor?: string
  inlineBackgroundColor?: string
  inlineHighlightRanges: InlineHighlightRange[]
  token: ThemedToken
  tokenStart: number
}

type SliceInlineHighlightRangesParams = {
  end: number
  inlineHighlightRanges: InlineHighlightRange[]
  start: number
}

type TokenizeLineParams = {
  content: string
  highlighter: Highlighter
  language: RenderLanguage
  maxLineLength: number
  theme: string
}

type ResolveThemeParams = {
  customThemes: CustomThemes
  themeName: string
}

export async function prepareRenderContext(
  configuration: SuisekiConfig,
): Promise<RenderContext> {
  const themeInput = resolveTheme({
    customThemes: configuration.customThemes,
    themeName: configuration.shiki.theme,
  })
  const themeName =
    typeof themeInput === "string" ? themeInput : themeInput.name
  if (themeName == null) {
    throw new Error(
      `Theme registration is missing a name: ${configuration.shiki.theme}`,
    )
  }
  // Shiki mutates a registered theme's `colors` map in place during
  // normalization, mangling display-p3 values. Hand it a clone so the
  // registry reference stays pristine for palette derivation.
  const themeForHighlighter =
    typeof themeInput === "string"
      ? themeInput
      : { ...themeInput, colors: { ...themeInput.colors } }
  const highlighter = await getSingletonHighlighter({
    themes: [themeForHighlighter],
    langs: ["plaintext"],
  })
  const palette = resolveThemePalette({
    colorsOverride:
      typeof themeInput === "string" ? undefined : themeInput.colors,
    highlighter,
    theme: themeName,
  })
  return {
    highlighter,
    palette,
    terminalWidth: getTerminalWidth(),
    themeName,
  }
}

export function renderTokenizedContent({
  backgroundColor,
  content,
  highlighter,
  inlineBackgroundColor,
  inlineHighlightRanges,
  language,
  maxLineLength,
  theme,
}: RenderTokenizedContentParams): string {
  let tokenStart = 0

  return tokenizeLine({
    content,
    highlighter,
    language,
    maxLineLength,
    theme,
  })
    .map((token) => {
      const renderedToken = renderTokenWithInlineHighlights({
        backgroundColor,
        inlineBackgroundColor,
        inlineHighlightRanges,
        token,
        tokenStart,
      })
      tokenStart += token.content.length
      return renderedToken
    })
    .join("")
}

function renderTokenWithInlineHighlights({
  backgroundColor,
  inlineBackgroundColor,
  inlineHighlightRanges,
  token,
  tokenStart,
}: RenderTokenWithInlineHighlightsParams): string {
  if (inlineBackgroundColor == null || inlineHighlightRanges.length === 0) {
    return emitToken({ token, backgroundColor })
  }

  const tokenEnd = tokenStart + token.content.length
  const tokenSegments: string[] = []
  let segmentStart = 0

  for (const inlineHighlightRange of inlineHighlightRanges) {
    const overlapStart = Math.max(tokenStart, inlineHighlightRange.start)
    const overlapEnd = Math.min(tokenEnd, inlineHighlightRange.end)

    if (overlapEnd <= overlapStart) {
      continue
    }

    const localOverlapStart = overlapStart - tokenStart
    const localOverlapEnd = overlapEnd - tokenStart
    const localHighlightStart = Math.max(localOverlapStart, segmentStart)

    if (localOverlapEnd <= localHighlightStart) {
      continue
    }

    if (localHighlightStart > segmentStart) {
      tokenSegments.push(
        emitToken({
          token: {
            ...token,
            content: token.content.slice(segmentStart, localHighlightStart),
          },
          backgroundColor,
        }),
      )
    }

    tokenSegments.push(
      emitToken({
        token: {
          ...token,
          content: token.content.slice(localHighlightStart, localOverlapEnd),
        },
        backgroundColor: inlineBackgroundColor,
      }),
    )

    segmentStart = localOverlapEnd
  }

  if (segmentStart < token.content.length) {
    tokenSegments.push(
      emitToken({
        token: {
          ...token,
          content: token.content.slice(segmentStart),
        },
        backgroundColor,
      }),
    )
  }

  return tokenSegments.join("")
}

export function sliceInlineHighlightRanges({
  end,
  inlineHighlightRanges,
  start,
}: SliceInlineHighlightRangesParams): InlineHighlightRange[] {
  const slicedRanges: InlineHighlightRange[] = []

  for (const inlineHighlightRange of inlineHighlightRanges) {
    const overlapStart = Math.max(start, inlineHighlightRange.start)
    const overlapEnd = Math.min(end, inlineHighlightRange.end)

    if (overlapEnd > overlapStart) {
      slicedRanges.push({
        start: overlapStart - start,
        end: overlapEnd - start,
      })
    }
  }

  return slicedRanges
}

function tokenizeLine({
  content,
  highlighter,
  language,
  maxLineLength,
  theme,
}: TokenizeLineParams) {
  if (content === "") {
    return []
  }

  const themeOption = theme as BundledTheme
  if (content.length > maxLineLength) {
    return (
      highlighter.codeToTokensBase(content, {
        lang: "plaintext",
        theme: themeOption,
      })[0] ?? []
    )
  }

  try {
    return (
      highlighter.codeToTokensBase(content, {
        lang: language,
        theme: themeOption,
      })[0] ?? []
    )
  } catch {
    return (
      highlighter.codeToTokensBase(content, {
        lang: "plaintext",
        theme: themeOption,
      })[0] ?? []
    )
  }
}

export async function resolveLanguageForFile(
  highlighter: Highlighter,
  fileName: string,
): Promise<RenderLanguage> {
  const detectedLanguage = getFiletypeFromFileName(fileName)

  if (detectedLanguage != null && isBundledLanguageName(detectedLanguage)) {
    try {
      await highlighter.loadLanguage(detectedLanguage)
      return detectedLanguage
    } catch {
      return "plaintext"
    }
  }

  return "plaintext"
}

function isBundledLanguageName(
  languageName: string,
): languageName is BundledLanguage {
  return Object.hasOwn(bundledLanguages, languageName)
}

function resolveTheme({
  customThemes,
  themeName,
}: ResolveThemeParams): BundledTheme | ThemeRegistrationRaw {
  if (isBundledThemeName(themeName)) {
    return themeName
  }

  if (isPierreThemeName(themeName)) {
    return PIERRE_THEMES[themeName]
  }

  const customTheme = customThemes[themeName]
  if (customTheme != null) {
    return customTheme
  }

  throw new Error(`Unknown theme: ${themeName}`)
}

export function stripLineEnding(line: string): string {
  return line.replace(/(\r\n|\r|\n)$/, "")
}

export function getTerminalWidth(): number {
  return process.stdout.columns != null && process.stdout.columns > 0
    ? process.stdout.columns
    : DEFAULT_TERMINAL_WIDTH
}
