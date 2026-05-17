import {
  type ChangeTypes,
  type FileDiffMetadata,
  getFiletypeFromFileName,
  type Hunk,
  parsePatchFiles,
} from "@pierre/diffs"
import {
  type BundledLanguage,
  type BundledTheme,
  bundledLanguages,
  getSingletonHighlighter,
  type Highlighter,
  type SpecialLanguage,
} from "shiki"
import {
  emitPadding,
  emitStyledText,
  emitToken,
  RESET,
  stripAnsi,
} from "../ansi"
import { isBundledThemeName, type SuisekiConfig } from "../config"
import { type ChangeSign, renderGutter } from "../gutter"
import { resolveThemePalette, type ThemePalette } from "../theme-palette"
import {
  type DiffLineCallbackProps,
  iterateOverDiff,
} from "../vendor/pierre/iterate-over-diff"

const DEFAULT_TERMINAL_WIDTH = 100

type DiffLineKind = "addition" | "context" | "deletion"

type UnifiedDiffLine = {
  content: string
  kind: DiffLineKind
  lineNumber: number
  noNewline: boolean
}

type SplitDiffSide = {
  content: string
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
  theme: BundledTheme
}

type RenderSplitDiffLineParams = {
  configuration: SuisekiConfig
  highlighter: Highlighter
  language: RenderLanguage
  line: SplitDiffLine
  lineNumberWidth: number
  palette: ThemePalette
  terminalWidth: number
  theme: BundledTheme
}

type RenderSplitSideParams = {
  columnWidth: number
  configuration: SuisekiConfig
  highlighter: Highlighter
  language: RenderLanguage
  lineNumberWidth: number
  palette: ThemePalette
  side: SplitDiffSide | undefined
  theme: BundledTheme
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
  const theme = resolveTheme(configuration.shiki.theme)
  const highlighter = await getSingletonHighlighter({
    themes: [theme],
    langs: ["plaintext"],
  })
  const palette = resolveThemePalette({ highlighter, theme })
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
                line: resolveSplitDiffLine(file, line),
                lineNumberWidth,
                palette,
                terminalWidth,
                theme,
              }),
            )
          } else {
            const unifiedLine = resolveUnifiedDiffLine(file, line)

            fileLines.push(
              renderUnifiedDiffLine({
                configuration,
                highlighter,
                language,
                line: unifiedLine,
                lineNumberWidth,
                palette,
                terminalWidth,
                theme,
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
  const sign = getChangeSign(line.kind)
  const normalizedContent = stripLineEnding(line.content)
  const gutter = renderGutter({
    additionSignColor: palette.addition,
    backgroundColor,
    deletionSignColor: palette.deletion,
    gutterForegroundColor: palette.dimmed,
    lineNumber: line.lineNumber,
    lineNumberWidth,
    lineNumbers: configuration.pierre["line-numbers"],
    sign,
  })
  const renderedContent = tokenizeLine({
    content: normalizedContent,
    highlighter,
    language,
    maxLineLength: configuration.shiki["max-line-length"],
    theme,
  })
    .map((token) => emitToken({ token, backgroundColor }))
    .join("")
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
  const sign = getChangeSign(side.kind)
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
    const gutter = renderGutter({
      additionSignColor: palette.addition,
      backgroundColor,
      deletionSignColor: palette.deletion,
      gutterForegroundColor: palette.dimmed,
      lineNumber: segmentIndex === 0 ? side.lineNumber : undefined,
      lineNumberWidth,
      lineNumbers: configuration.pierre["line-numbers"],
      sign: segmentIndex === 0 ? sign : " ",
    })
    const renderedContent = tokenizeLine({
      content: contentSegment,
      highlighter,
      language,
      maxLineLength: configuration.shiki["max-line-length"],
      theme,
    })
      .map((token) => emitToken({ token, backgroundColor }))
      .join("")
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

type TokenizeLineParams = {
  content: string
  highlighter: Highlighter
  language: RenderLanguage
  maxLineLength: number
  theme: BundledTheme
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

  if (content.length > maxLineLength) {
    return (
      highlighter.codeToTokensBase(content, {
        lang: "plaintext",
        theme,
      })[0] ?? []
    )
  }

  try {
    return (
      highlighter.codeToTokensBase(content, { lang: language, theme })[0] ?? []
    )
  } catch {
    return (
      highlighter.codeToTokensBase(content, {
        lang: "plaintext",
        theme,
      })[0] ?? []
    )
  }
}

function resolveUnifiedDiffLine(
  file: FileDiffMetadata,
  line: DiffLineCallbackProps,
): UnifiedDiffLine {
  if (line.deletionLine != null && line.additionLine == null) {
    return {
      content: file.deletionLines[line.deletionLine.lineIndex] ?? "",
      kind: "deletion",
      lineNumber: line.deletionLine.lineNumber,
      noNewline: line.deletionLine.noEOFCR,
    }
  }

  if (line.additionLine != null && line.deletionLine == null) {
    return {
      content: file.additionLines[line.additionLine.lineIndex] ?? "",
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
    kind: "context",
    lineNumber: line.additionLine.lineNumber,
    noNewline: line.additionLine.noEOFCR || line.deletionLine.noEOFCR,
  }
}

function resolveSplitDiffLine(
  file: FileDiffMetadata,
  line: DiffLineCallbackProps,
): SplitDiffLine {
  const deletion: SplitDiffSide | undefined =
    line.deletionLine == null
      ? undefined
      : {
          content: file.deletionLines[line.deletionLine.lineIndex] ?? "",
          kind: line.type === "change" ? "deletion" : "context",
          lineNumber: line.deletionLine.lineNumber,
        }
  const addition: SplitDiffSide | undefined =
    line.additionLine == null
      ? undefined
      : {
          content: file.additionLines[line.additionLine.lineIndex] ?? "",
          kind: line.type === "change" ? "addition" : "context",
          lineNumber: line.additionLine.lineNumber,
        }

  return {
    addition,
    deletion,
  }
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

function resolveTheme(themeName: string): BundledTheme {
  if (isBundledThemeName(themeName)) {
    return themeName
  }

  throw new Error(`Unknown Shiki theme: ${themeName}`)
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
    additionSignColor: palette.addition,
    deletionSignColor: palette.deletion,
    gutterForegroundColor: palette.dimmed,
    lineNumberWidth,
    lineNumbers: configuration.pierre["line-numbers"],
    sign: " ",
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

function getChangeSign(kind: DiffLineKind): ChangeSign {
  if (kind === "addition") {
    return "+"
  }

  if (kind === "deletion") {
    return "-"
  }

  return " "
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
