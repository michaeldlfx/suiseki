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

type RenderLanguage = BundledLanguage | SpecialLanguage

export async function renderDiff(
  patch: string,
  configuration: SuisekiConfig,
): Promise<string> {
  const patches = parsePatchFiles(stripAnsi(patch), undefined, true)
  const theme = resolveTheme(configuration.shiki.theme)
  const highlighter = await getSingletonHighlighter({
    themes: [theme],
    langs: ["plaintext"],
  })
  const palette = resolveThemePalette({ highlighter, theme })
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
        diffStyle: "unified",
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
                getTerminalWidth(),
                palette,
              ),
            )
          }

          const unifiedLine = resolveUnifiedDiffLine(file, line)

          if (unifiedLine.kind === "addition") additionCount++
          if (unifiedLine.kind === "deletion") deletionCount++

          fileLines.push(
            renderUnifiedDiffLine({
              configuration,
              highlighter,
              language,
              line: unifiedLine,
              lineNumberWidth,
              palette,
              terminalWidth: getTerminalWidth(),
              theme,
            }),
          )

          if (hasNoNewlineMarker(line)) {
            fileLines.push(
              emitNoNewlineMarker({
                configuration,
                lineNumberWidth,
                palette,
              }),
            )
          }

          if (line.collapsedAfter > 0) {
            fileLines.push(
              emitUnmodifiedLineCount(
                line.collapsedAfter,
                getTerminalWidth(),
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
            terminalWidth: getTerminalWidth(),
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
  const visibleLength = gutter.visibleLength + normalizedContent.length

  return `${gutter.text}${renderedContent}${emitPadding({
    backgroundColor,
    visibleLength,
    width: terminalWidth,
  })}`
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
    foregroundColor: palette.dimmed,
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
    const prev = splitPath(file.prevName)
    const curr = splitPath(file.name)

    const prevRendered =
      (prev.directory !== ""
        ? emitStyledText({
            text: prev.directory,
            foregroundColor: palette.dimmed,
          })
        : "") +
      emitStyledText({
        text: prev.fileName,
        foregroundColor: palette.foreground,
        bold: true,
      })

    const currRendered =
      (curr.directory !== ""
        ? emitStyledText({
            text: curr.directory,
            foregroundColor: palette.dimmed,
          })
        : "") +
      emitStyledText({
        text: curr.fileName,
        foregroundColor: palette.foreground,
        bold: true,
      })

    return `${prevRendered} ${emitStyledText({ text: "→", foregroundColor: palette.dimmed })} ${currRendered}`
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

function stripLineEnding(line: string): string {
  return line.replace(/\r?\n$/, "")
}

function getTerminalWidth(): number {
  return process.stdout.columns != null && process.stdout.columns > 0
    ? process.stdout.columns
    : DEFAULT_TERMINAL_WIDTH
}
