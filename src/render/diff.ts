import {
  type ChangeTypes,
  type FileDiffMetadata,
  getFiletypeFromFileName,
  type Hunk,
  parsePatchFiles,
} from "@pierre/diffs"
import { type ChangeObject, diffChars, diffWordsWithSpace } from "diff"
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
import {
  emitPadding,
  emitStyledText,
  emitToken,
  RESET,
  stripAnsi,
} from "../ansi"
import { isBundledThemeName, type SuisekiConfig } from "../config"
import type { CustomThemes } from "../custom-themes"
import { type ChangeMarker, renderGutter } from "../gutter"
import { isPierreThemeName, PIERRE_THEMES } from "../pierre-themes"
import { resolveThemePalette, type ThemePalette } from "../theme-palette"
import {
  type DiffLineCallbackProps,
  iterateOverDiff,
} from "../vendor/pierre/iterate-over-diff"

const DEFAULT_TERMINAL_WIDTH = 100

type DiffLineKind = "addition" | "context" | "deletion"

type UnifiedDiffLine = {
  content: string
  inlineHighlightRanges: InlineHighlightRange[]
  kind: DiffLineKind
  lineNumber: number
  noNewline: boolean
}

type SplitDiffSide = {
  content: string
  inlineHighlightRanges: InlineHighlightRange[]
  kind: DiffLineKind
  lineNumber: number
}

type SplitDiffLine = {
  addition?: SplitDiffSide
  deletion?: SplitDiffSide
}

type RenderUnifiedDiffLineParams = {
  configuration: SuisekiConfig
  highlighter: Highlighter
  language: RenderLanguage
  line: UnifiedDiffLine
  lineNumberWidth: number
  palette: ThemePalette
  terminalWidth: number
  theme: string
}

type RenderSplitDiffLineParams = {
  configuration: SuisekiConfig
  highlighter: Highlighter
  language: RenderLanguage
  line: SplitDiffLine
  lineNumberWidth: number
  palette: ThemePalette
  terminalWidth: number
  theme: string
}

type RenderSplitSideParams = {
  columnWidth: number
  configuration: SuisekiConfig
  highlighter: Highlighter
  language: RenderLanguage
  lineNumberWidth: number
  palette: ThemePalette
  side: SplitDiffSide | undefined
  theme: string
}

type InlineHighlightRange = {
  end: number
  start: number
}

type InlineHighlightRanges = {
  additions: Map<number, InlineHighlightRange[]>
  deletions: Map<number, InlineHighlightRange[]>
}

type InlineHighlightPair = {
  additions: InlineHighlightRange[]
  deletions: InlineHighlightRange[]
}

type InlineHighlightSpan = [highlighted: boolean, text: string]

type ResolveInlineHighlightRangesParams = {
  configuration: SuisekiConfig
  file: FileDiffMetadata
}

type ComputeInlineHighlightRangesParams = {
  additionLine: string
  deletionLine: string
  maxLineDiffLength: number
  wordDiff: SuisekiConfig["pierre"]["word-diff"]
}

type PushInlineHighlightSpanParams = {
  change: ChangeObject<string>
  highlightedSpans: InlineHighlightSpan[]
  isLastChange: boolean
  isNeutral?: boolean
  joinNeutralSpans: boolean
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

type SplitLayout = {
  leftWidth: number
  rightWidth: number
}

type RenderLanguage = BundledLanguage | SpecialLanguage

export async function renderDiff(
  patch: string,
  configuration: SuisekiConfig,
): Promise<string> {
  // parsePatchFiles(source, fileFilter, parsePatchMetadata)
  const patches = parsePatchFiles(stripAnsi(patch), undefined, true)
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
  const terminalWidth = getTerminalWidth()
  const outputLines: string[] = []

  let fileIndex = 0

  for (const parsedPatch of patches) {
    outputLines.push(...renderPatchMetadata(parsedPatch.patchMetadata, palette))

    for (const file of parsedPatch.files) {
      if (fileIndex > 0) {
        outputLines.push("")
      }

      const language = await resolveLanguageForFile(highlighter, file.name)
      const lineNumberWidth = getLineNumberWidth(file)
      const emittedHunkIndexes = new Set<number>()
      const inlineHighlightRanges = resolveInlineHighlightRanges({
        configuration,
        file,
      })
      const fileLines: string[] = []
      let additionCount = 0
      let deletionCount = 0

      iterateOverDiff({
        diff: file,
        diffStyle: configuration.pierre.view,
        callback(line) {
          if (line.hunk != null && !emittedHunkIndexes.has(line.hunkIndex)) {
            emittedHunkIndexes.add(line.hunkIndex)
            if (configuration.pierre["hunk-header"] === "full") {
              fileLines.push(emitHunkHeader(line.hunk, palette))
            }
          }

          if (line.collapsedBefore > 0) {
            fileLines.push(
              emitUnmodifiedLineCount(
                line.collapsedBefore,
                terminalWidth,
                palette,
              ),
            )
          }

          if (line.type === "change" && line.additionLine != null) {
            additionCount++
          }
          if (line.type === "change" && line.deletionLine != null) {
            deletionCount++
          }

          if (configuration.pierre.view === "split") {
            fileLines.push(
              ...renderSplitDiffLine({
                configuration,
                highlighter,
                language,
                line: resolveSplitDiffLine(file, line, inlineHighlightRanges),
                lineNumberWidth,
                palette,
                terminalWidth,
                theme: themeName,
              }),
            )
          } else {
            const unifiedLine = resolveUnifiedDiffLine(
              file,
              line,
              inlineHighlightRanges,
            )

            fileLines.push(
              renderUnifiedDiffLine({
                configuration,
                highlighter,
                language,
                line: unifiedLine,
                lineNumberWidth,
                palette,
                terminalWidth,
                theme: themeName,
              }),
            )
          }

          if (hasNoNewlineMarker(line)) {
            const noNewlineMarker =
              configuration.pierre.view === "split"
                ? emitSplitNoNewlineMarker({
                    palette,
                    terminalWidth,
                  })
                : emitNoNewlineMarker({
                    configuration,
                    lineNumberWidth,
                    palette,
                  })

            fileLines.push(noNewlineMarker)
          }

          if (line.collapsedAfter > 0) {
            fileLines.push(
              emitUnmodifiedLineCount(
                line.collapsedAfter,
                terminalWidth,
                palette,
              ),
            )
          }

          return undefined
        },
      })

      if (configuration.pierre["file-header"]) {
        outputLines.push(
          emitFileHeader({
            file,
            additionCount,
            deletionCount,
            palette,
            terminalWidth,
          }),
        )
        if (fileLines.length > 0) {
          outputLines.push("")
        }
      }
      outputLines.push(...fileLines)
      fileIndex++
    }
  }

  return outputLines.join("\n")
}

function renderUnifiedDiffLine({
  configuration,
  highlighter,
  language,
  line,
  lineNumberWidth,
  palette,
  terminalWidth,
  theme,
}: RenderUnifiedDiffLineParams): string {
  const backgroundColor = configuration.pierre["diff-background"]
    ? getBackgroundColor(line.kind, palette)
    : undefined
  const marker = getChangeMarker({
    changeIndicator: configuration.pierre["change-indicator"],
    kind: line.kind,
  })
  const normalizedContent = stripLineEnding(line.content)
  const gutter = renderGutter({
    backgroundColor,
    gutterForegroundColor: palette.dimmed,
    lineNumber: line.lineNumber,
    lineNumberWidth,
    lineNumbers: configuration.pierre["line-numbers"],
    marker,
    markerForegroundColor: getChangeMarkerColor(line.kind, palette),
  })
  const inlineBackgroundColor =
    configuration.pierre["diff-background"] &&
    line.inlineHighlightRanges.length > 0
      ? getInlineBackgroundColor(line.kind, palette)
      : undefined
  const renderedContent = renderTokenizedContent({
    backgroundColor,
    content: normalizedContent,
    highlighter,
    inlineBackgroundColor,
    inlineHighlightRanges: line.inlineHighlightRanges,
    language,
    maxLineLength: configuration.shiki["max-line-length"],
    theme,
  })
  // TODO: JS string length over-counts combining marks and under-counts CJK/emoji.
  // Use a Unicode-aware width function (e.g. string-width) for correct padding.
  const visibleLength = gutter.visibleLength + normalizedContent.length

  return `${gutter.text}${renderedContent}${emitPadding({
    backgroundColor,
    visibleLength,
    width: terminalWidth,
  })}`
}

function renderSplitDiffLine({
  configuration,
  highlighter,
  language,
  line,
  lineNumberWidth,
  palette,
  terminalWidth,
  theme,
}: RenderSplitDiffLineParams): string[] {
  const layout = getSplitLayout(terminalWidth)
  const deletionRows = renderSplitSide({
    columnWidth: layout.leftWidth,
    configuration,
    highlighter,
    language,
    lineNumberWidth,
    palette,
    side: line.deletion,
    theme,
  })
  const additionRows = renderSplitSide({
    columnWidth: layout.rightWidth,
    configuration,
    highlighter,
    language,
    lineNumberWidth,
    palette,
    side: line.addition,
    theme,
  })
  const rowCount = Math.max(deletionRows.length, additionRows.length)
  const separator = renderSplitSeparator(palette)
  const rows: string[] = []

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    rows.push(
      `${deletionRows[rowIndex] ?? renderEmptySplitSide(layout.leftWidth)}${separator}${
        additionRows[rowIndex] ?? renderEmptySplitSide(layout.rightWidth)
      }`,
    )
  }

  return rows
}

function renderSplitSide({
  columnWidth,
  configuration,
  highlighter,
  language,
  lineNumberWidth,
  palette,
  side,
  theme,
}: RenderSplitSideParams): string[] {
  if (side == null) {
    return [renderEmptySplitSide(columnWidth)]
  }

  const backgroundColor = configuration.pierre["diff-background"]
    ? getBackgroundColor(side.kind, palette)
    : undefined
  const inlineBackgroundColor =
    configuration.pierre["diff-background"] &&
    side.inlineHighlightRanges.length > 0
      ? getInlineBackgroundColor(side.kind, palette)
      : undefined
  const marker = getChangeMarker({
    changeIndicator: configuration.pierre["change-indicator"],
    kind: side.kind,
  })
  const normalizedContent = stripLineEnding(side.content)
  const contentWidth = Math.max(
    columnWidth -
      getGutterVisibleLength({
        lineNumberWidth,
        lineNumbers: configuration.pierre["line-numbers"],
      }),
    1,
  )
  const contentSegments = wrapContent(normalizedContent, contentWidth)

  return contentSegments.map((contentSegment, segmentIndex) => {
    const contentOffset = segmentIndex * contentWidth
    const gutter = renderGutter({
      backgroundColor,
      gutterForegroundColor: palette.dimmed,
      lineNumber: segmentIndex === 0 ? side.lineNumber : undefined,
      lineNumberWidth,
      lineNumbers: configuration.pierre["line-numbers"],
      marker: segmentIndex === 0 ? marker : " ",
      markerForegroundColor: getChangeMarkerColor(side.kind, palette),
    })
    const renderedContent = renderTokenizedContent({
      backgroundColor,
      content: contentSegment,
      highlighter,
      inlineBackgroundColor,
      inlineHighlightRanges: sliceInlineHighlightRanges({
        inlineHighlightRanges: side.inlineHighlightRanges,
        start: contentOffset,
        end: contentOffset + contentSegment.length,
      }),
      language,
      maxLineLength: configuration.shiki["max-line-length"],
      theme,
    })
    const visibleLength = gutter.visibleLength + contentSegment.length

    return `${gutter.text}${renderedContent}${emitFixedWidthPadding({
      backgroundColor,
      visibleLength,
      width: columnWidth,
    })}`
  })
}

function renderEmptySplitSide(columnWidth: number): string {
  return emitStyledText({
    text: " ".repeat(columnWidth),
  })
}

function renderSplitSeparator(palette: ThemePalette): string {
  return emitStyledText({
    text: "│",
    foregroundColor: palette.separatorForeground,
  })
}

type EmitFixedWidthPaddingParams = {
  backgroundColor?: string
  visibleLength: number
  width: number
}

function emitFixedWidthPadding({
  backgroundColor,
  visibleLength,
  width,
}: EmitFixedWidthPaddingParams): string {
  const paddingLength = Math.max(width - visibleLength, 0)

  if (paddingLength === 0) {
    return RESET
  }

  return emitStyledText({
    text: " ".repeat(paddingLength),
    backgroundColor,
  })
}

function wrapContent(content: string, width: number): string[] {
  if (content === "") {
    return [""]
  }

  const contentSegments: string[] = []

  for (let index = 0; index < content.length; index += width) {
    contentSegments.push(content.slice(index, index + width))
  }

  return contentSegments
}

function renderTokenizedContent({
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

function sliceInlineHighlightRanges({
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

type TokenizeLineParams = {
  content: string
  highlighter: Highlighter
  language: RenderLanguage
  maxLineLength: number
  theme: string
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

function resolveUnifiedDiffLine(
  file: FileDiffMetadata,
  line: DiffLineCallbackProps,
  inlineHighlightRanges: InlineHighlightRanges,
): UnifiedDiffLine {
  if (line.deletionLine != null && line.additionLine == null) {
    return {
      content: file.deletionLines[line.deletionLine.lineIndex] ?? "",
      inlineHighlightRanges:
        inlineHighlightRanges.deletions.get(line.deletionLine.lineIndex) ?? [],
      kind: "deletion",
      lineNumber: line.deletionLine.lineNumber,
      noNewline: line.deletionLine.noEOFCR,
    }
  }

  if (line.additionLine != null && line.deletionLine == null) {
    return {
      content: file.additionLines[line.additionLine.lineIndex] ?? "",
      inlineHighlightRanges:
        inlineHighlightRanges.additions.get(line.additionLine.lineIndex) ?? [],
      kind: "addition",
      lineNumber: line.additionLine.lineNumber,
      noNewline: line.additionLine.noEOFCR,
    }
  }

  return {
    content:
      file.additionLines[line.additionLine.lineIndex] ??
      file.deletionLines[line.deletionLine.lineIndex] ??
      "",
    inlineHighlightRanges: [],
    kind: "context",
    lineNumber: line.additionLine.lineNumber,
    noNewline: line.additionLine.noEOFCR || line.deletionLine.noEOFCR,
  }
}

function resolveSplitDiffLine(
  file: FileDiffMetadata,
  line: DiffLineCallbackProps,
  inlineHighlightRanges: InlineHighlightRanges,
): SplitDiffLine {
  const deletion: SplitDiffSide | undefined =
    line.deletionLine == null
      ? undefined
      : {
          content: file.deletionLines[line.deletionLine.lineIndex] ?? "",
          inlineHighlightRanges:
            inlineHighlightRanges.deletions.get(line.deletionLine.lineIndex) ??
            [],
          kind: line.type === "change" ? "deletion" : "context",
          lineNumber: line.deletionLine.lineNumber,
        }
  const addition: SplitDiffSide | undefined =
    line.additionLine == null
      ? undefined
      : {
          content: file.additionLines[line.additionLine.lineIndex] ?? "",
          inlineHighlightRanges:
            inlineHighlightRanges.additions.get(line.additionLine.lineIndex) ??
            [],
          kind: line.type === "change" ? "addition" : "context",
          lineNumber: line.additionLine.lineNumber,
        }

  return {
    addition,
    deletion,
  }
}

function resolveInlineHighlightRanges({
  configuration,
  file,
}: ResolveInlineHighlightRangesParams): InlineHighlightRanges {
  const inlineHighlightRanges: InlineHighlightRanges = {
    additions: new Map(),
    deletions: new Map(),
  }

  if (
    configuration.pierre["word-diff"] === "none" ||
    !configuration.pierre["diff-background"]
  ) {
    return inlineHighlightRanges
  }

  for (const hunk of file.hunks) {
    for (const hunkContent of hunk.hunkContent) {
      if (hunkContent.type !== "change") {
        continue
      }

      const pairedLineCount = Math.min(
        hunkContent.deletions,
        hunkContent.additions,
      )

      for (let lineOffset = 0; lineOffset < pairedLineCount; lineOffset++) {
        const deletionLineIndex = hunkContent.deletionLineIndex + lineOffset
        const additionLineIndex = hunkContent.additionLineIndex + lineOffset
        const lineInlineHighlightRanges = computeInlineHighlightRanges({
          additionLine: file.additionLines[additionLineIndex] ?? "",
          deletionLine: file.deletionLines[deletionLineIndex] ?? "",
          maxLineDiffLength: configuration.pierre["max-line-diff-length"],
          wordDiff: configuration.pierre["word-diff"],
        })

        if (lineInlineHighlightRanges.deletions.length > 0) {
          inlineHighlightRanges.deletions.set(
            deletionLineIndex,
            lineInlineHighlightRanges.deletions,
          )
        }

        if (lineInlineHighlightRanges.additions.length > 0) {
          inlineHighlightRanges.additions.set(
            additionLineIndex,
            lineInlineHighlightRanges.additions,
          )
        }
      }
    }
  }

  return inlineHighlightRanges
}

function computeInlineHighlightRanges({
  additionLine,
  deletionLine,
  maxLineDiffLength,
  wordDiff,
}: ComputeInlineHighlightRangesParams): InlineHighlightPair {
  const normalizedAdditionLine = stripLineEnding(additionLine)
  const normalizedDeletionLine = stripLineEnding(deletionLine)
  const inlineHighlightRanges: InlineHighlightPair = {
    additions: [],
    deletions: [],
  }

  if (
    normalizedAdditionLine.length > maxLineDiffLength ||
    normalizedDeletionLine.length > maxLineDiffLength
  ) {
    return inlineHighlightRanges
  }

  const changes =
    wordDiff === "char"
      ? diffChars(normalizedDeletionLine, normalizedAdditionLine)
      : diffWordsWithSpace(normalizedDeletionLine, normalizedAdditionLine)
  const additionSpans: InlineHighlightSpan[] = []
  const deletionSpans: InlineHighlightSpan[] = []
  const joinNeutralSpans = wordDiff === "word-alt"
  const lastChange = changes.at(-1)

  for (const change of changes) {
    const isLastChange = change === lastChange

    if (!change.added && !change.removed) {
      pushInlineHighlightSpan({
        change,
        highlightedSpans: deletionSpans,
        isLastChange,
        isNeutral: true,
        joinNeutralSpans,
      })
      pushInlineHighlightSpan({
        change,
        highlightedSpans: additionSpans,
        isLastChange,
        isNeutral: true,
        joinNeutralSpans,
      })
      continue
    }

    if (change.removed) {
      pushInlineHighlightSpan({
        change,
        highlightedSpans: deletionSpans,
        isLastChange,
        joinNeutralSpans,
      })
      continue
    }

    pushInlineHighlightSpan({
      change,
      highlightedSpans: additionSpans,
      isLastChange,
      joinNeutralSpans,
    })
  }

  inlineHighlightRanges.deletions =
    getInlineHighlightRangesFromSpans(deletionSpans)
  inlineHighlightRanges.additions =
    getInlineHighlightRangesFromSpans(additionSpans)

  return inlineHighlightRanges
}

function pushInlineHighlightSpan({
  change,
  highlightedSpans,
  isLastChange,
  isNeutral = false,
  joinNeutralSpans,
}: PushInlineHighlightSpanParams): void {
  const latestSpan = highlightedSpans.at(-1)
  if (latestSpan == null || isLastChange || !joinNeutralSpans) {
    highlightedSpans.push([!isNeutral, change.value])
    return
  }

  const latestSpanIsNeutral = !latestSpan[0]
  if (
    isNeutral === latestSpanIsNeutral ||
    (isNeutral && change.value.length === 1 && !latestSpanIsNeutral)
  ) {
    latestSpan[1] += change.value
    return
  }

  highlightedSpans.push([!isNeutral, change.value])
}

function getInlineHighlightRangesFromSpans(
  highlightedSpans: InlineHighlightSpan[],
): InlineHighlightRange[] {
  const inlineHighlightRanges: InlineHighlightRange[] = []
  let spanOffset = 0

  for (const [highlighted, text] of highlightedSpans) {
    if (highlighted) {
      inlineHighlightRanges.push({
        start: spanOffset,
        end: spanOffset + text.length,
      })
    }
    spanOffset += text.length
  }

  return inlineHighlightRanges
}

async function resolveLanguageForFile(
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

type ResolveThemeParams = {
  customThemes: CustomThemes
  themeName: string
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

function renderPatchMetadata(
  patchMetadata: string | undefined,
  palette: ThemePalette,
): string[] {
  if (patchMetadata == null || patchMetadata.trim() === "") {
    return []
  }

  return patchMetadata
    .trimEnd()
    .split(/\r?\n/)
    .map((line) =>
      emitStyledText({
        text: line,
        foregroundColor: palette.dimmed,
      }),
    )
}

type EmitFileHeaderParams = {
  file: FileDiffMetadata
  additionCount: number
  deletionCount: number
  palette: ThemePalette
  terminalWidth: number
}

function emitFileHeader({
  file,
  additionCount,
  deletionCount,
  palette,
  terminalWidth,
}: EmitFileHeaderParams): string {
  const statusIcon = getFileStatusIcon(file.type)
  const summaryText = `-${deletionCount} +${additionCount} `
  const headerPrefixVisibleLength =
    statusIcon.length + 1 + getFileNameVisibleLength(file)
  const paddingLength = Math.max(
    terminalWidth - headerPrefixVisibleLength - summaryText.length,
    2,
  )

  const statusIconRendered = emitStyledText({
    text: statusIcon,
    foregroundColor: getFileStatusColor(file.type, palette),
  })
  const fileNameRendered = renderFormattedFileName(file, palette)
  const padding = emitStyledText({
    text: " ".repeat(paddingLength),
  })
  const deletionSummary = emitStyledText({
    text: `-${deletionCount}`,
    foregroundColor: palette.deletion,
  })
  const additionSummary = emitStyledText({
    text: `+${additionCount}`,
    foregroundColor: palette.addition,
  })

  return `${statusIconRendered} ${fileNameRendered}${padding}${deletionSummary} ${additionSummary}`
}

function emitHunkHeader(hunk: Hunk, palette: ThemePalette): string {
  return emitStyledText({
    text: stripLineEnding(hunk.hunkSpecs ?? "@@"),
    foregroundColor: palette.accent,
  })
}

function emitUnmodifiedLineCount(
  unmodifiedLineCount: number,
  terminalWidth: number,
  palette: ThemePalette,
): string {
  const label =
    unmodifiedLineCount === 1
      ? "  1 unmodified line"
      : `  ${unmodifiedLineCount} unmodified lines`
  const paddingLength = Math.max(terminalWidth - label.length, 0)

  return emitStyledText({
    text: `${label}${" ".repeat(paddingLength)}`,
    foregroundColor: palette.separatorForeground,
    backgroundColor: palette.separatorBackground,
  })
}

type EmitNoNewlineMarkerParams = {
  configuration: SuisekiConfig
  lineNumberWidth: number
  palette: ThemePalette
}

function emitNoNewlineMarker({
  configuration,
  lineNumberWidth,
  palette,
}: EmitNoNewlineMarkerParams): string {
  const gutter = renderGutter({
    gutterForegroundColor: palette.dimmed,
    lineNumberWidth,
    lineNumbers: configuration.pierre["line-numbers"],
    marker: " ",
    markerForegroundColor: palette.dimmed,
  })

  return `${gutter.text}${emitStyledText({
    text: "\\ No newline at end of file",
    foregroundColor: palette.dimmed,
  })}${RESET}`
}

type EmitSplitNoNewlineMarkerParams = {
  palette: ThemePalette
  terminalWidth: number
}

function emitSplitNoNewlineMarker({
  palette,
  terminalWidth,
}: EmitSplitNoNewlineMarkerParams): string {
  const marker = "\\ No newline at end of file"
  const paddingLength = Math.max(terminalWidth - marker.length, 0)

  return `${emitStyledText({
    text: `${marker}${" ".repeat(paddingLength)}`,
    foregroundColor: palette.dimmed,
  })}${RESET}`
}

function splitPath(filePath: string): { directory: string; fileName: string } {
  const lastSlash = filePath.lastIndexOf("/")

  if (lastSlash === -1) {
    return { directory: "", fileName: filePath }
  }

  return {
    directory: filePath.slice(0, lastSlash + 1),
    fileName: filePath.slice(lastSlash + 1),
  }
}

function renderFormattedFileName(
  file: FileDiffMetadata,
  palette: ThemePalette,
): string {
  if (file.prevName != null && file.prevName !== file.name) {
    const previous = splitPath(file.prevName)
    const current = splitPath(file.name)

    const previousRendered =
      (previous.directory !== ""
        ? emitStyledText({
            text: previous.directory,
            foregroundColor: palette.dimmed,
          })
        : "") +
      emitStyledText({
        text: previous.fileName,
        foregroundColor: palette.foreground,
        bold: true,
      })

    const currentRendered =
      (current.directory !== ""
        ? emitStyledText({
            text: current.directory,
            foregroundColor: palette.dimmed,
          })
        : "") +
      emitStyledText({
        text: current.fileName,
        foregroundColor: palette.foreground,
        bold: true,
      })

    return `${previousRendered} ${emitStyledText({ text: "→", foregroundColor: palette.dimmed })} ${currentRendered}`
  }

  const { directory, fileName } = splitPath(file.name)

  const directoryRendered =
    directory !== ""
      ? emitStyledText({ text: directory, foregroundColor: palette.dimmed })
      : ""

  const fileNameRendered = emitStyledText({
    text: fileName,
    foregroundColor: palette.foreground,
    bold: true,
  })

  return `${directoryRendered}${fileNameRendered}`
}

function getFileNameVisibleLength(file: FileDiffMetadata): number {
  if (file.prevName != null && file.prevName !== file.name) {
    return file.prevName.length + 3 + file.name.length
  }

  return file.name.length
}

function getFileStatusIcon(changeType: ChangeTypes): string {
  switch (changeType) {
    case "change":
      return "Δ"
    case "new":
      return "+"
    case "deleted":
      return "-"
    case "rename-pure":
    case "rename-changed":
      return "→"
  }
}

function getFileStatusColor(
  changeType: ChangeTypes,
  palette: ThemePalette,
): string {
  switch (changeType) {
    case "change":
      return palette.foreground
    case "new":
      return palette.addition
    case "deleted":
      return palette.deletion
    case "rename-pure":
    case "rename-changed":
      return palette.accent
  }
}

function hasNoNewlineMarker(line: DiffLineCallbackProps): boolean {
  return (
    line.deletionLine?.noEOFCR === true || line.additionLine?.noEOFCR === true
  )
}

function getLineNumberWidth(file: FileDiffMetadata): number {
  const maxLineNumber = file.hunks.reduce((largestLineNumber, hunk) => {
    return Math.max(
      largestLineNumber,
      hunk.deletionStart + Math.max(hunk.deletionCount - 1, 0),
      hunk.additionStart + Math.max(hunk.additionCount - 1, 0),
    )
  }, 0)

  return Math.max(String(maxLineNumber).length, 1)
}

function getBackgroundColor(
  kind: DiffLineKind,
  palette: ThemePalette,
): string | undefined {
  if (kind === "addition") {
    return palette.additionBackground
  }

  if (kind === "deletion") {
    return palette.deletionBackground
  }

  return undefined
}

function getInlineBackgroundColor(
  kind: DiffLineKind,
  palette: ThemePalette,
): string | undefined {
  if (kind === "addition") {
    return palette.additionInlineBackground
  }

  if (kind === "deletion") {
    return palette.deletionInlineBackground
  }

  return undefined
}

function getChangeMarker({
  changeIndicator,
  kind,
}: {
  changeIndicator: SuisekiConfig["pierre"]["change-indicator"]
  kind: DiffLineKind
}): ChangeMarker {
  if (changeIndicator === "background" || kind === "context") {
    return " "
  }

  if (changeIndicator === "bar") {
    return "│"
  }

  return kind === "addition" ? "+" : "-"
}

function getChangeMarkerColor(
  kind: DiffLineKind,
  palette: ThemePalette,
): string {
  if (kind === "addition") {
    return palette.addition
  }

  if (kind === "deletion") {
    return palette.deletion
  }

  return palette.dimmed
}

function getGutterVisibleLength({
  lineNumberWidth,
  lineNumbers,
}: {
  lineNumberWidth: number
  lineNumbers: boolean
}): number {
  return lineNumbers ? lineNumberWidth + 5 : 3
}

function getSplitLayout(terminalWidth: number): SplitLayout {
  const availableWidth = Math.max(terminalWidth - 1, 2)
  const leftWidth = Math.floor(availableWidth / 2)

  return {
    leftWidth,
    rightWidth: availableWidth - leftWidth,
  }
}

function stripLineEnding(line: string): string {
  return line.replace(/(\r\n|\r|\n)$/, "")
}

function getTerminalWidth(): number {
  return process.stdout.columns != null && process.stdout.columns > 0
    ? process.stdout.columns
    : DEFAULT_TERMINAL_WIDTH
}
