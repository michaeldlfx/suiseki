import {
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
import {
  type DiffLineCallbackProps,
  iterateOverDiff,
} from "../vendor/pierre/iterate-over-diff"

const DEFAULT_TERMINAL_WIDTH = 100

const DIFF_BACKGROUND_COLORS = {
  addition: "#0e2e0e",
  deletion: "#2e0e0e",
}

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
  terminalWidth: number
  theme: BundledTheme
}

type RenderLanguage = BundledLanguage | SpecialLanguage

type RenderPierreDiffLineParams = {
  configuration: SuisekiConfig
  file: FileDiffMetadata
  highlighter: Highlighter
  language: RenderLanguage
  line: DiffLineCallbackProps
  lineNumberWidth: number
  terminalWidth: number
  theme: BundledTheme
}

export async function renderDiff(
  patch: string,
  configuration: SuisekiConfig,
): Promise<string> {
  const patches = parsePatchFiles(stripAnsi(patch), undefined, true)
  const theme = resolveTheme(configuration.theme)
  const highlighter = await getSingletonHighlighter({
    themes: [theme],
    langs: ["plaintext"],
  })
  const outputLines: string[] = []

  for (const parsedPatch of patches) {
    outputLines.push(...renderPatchMetadata(parsedPatch.patchMetadata))

    for (const file of parsedPatch.files) {
      const language = await resolveLanguageForFile(highlighter, file.name)
      const lineNumberWidth = getLineNumberWidth(file)
      const emittedHunkIndexes = new Set<number>()

      outputLines.push(emitFileHeader(file))

      iterateOverDiff({
        diff: file,
        diffStyle: "unified",
        callback(line) {
          if (line.hunk != null && !emittedHunkIndexes.has(line.hunkIndex)) {
            emittedHunkIndexes.add(line.hunkIndex)
            outputLines.push(emitHunkHeader(line.hunk))
          }

          if (line.collapsedBefore > 0) {
            outputLines.push(emitCollapsedLineCount(line.collapsedBefore))
          }

          outputLines.push(
            renderPierreDiffLine({
              configuration,
              file,
              highlighter,
              language,
              line,
              lineNumberWidth,
              terminalWidth: getTerminalWidth(),
              theme,
            }),
          )

          if (hasNoNewlineMarker(line)) {
            outputLines.push(
              emitNoNewlineMarker({
                configuration,
                lineNumberWidth,
              }),
            )
          }

          if (line.collapsedAfter > 0) {
            outputLines.push(emitCollapsedLineCount(line.collapsedAfter))
          }

          return undefined
        },
      })
    }
  }

  return outputLines.join("\n")
}

function renderPierreDiffLine({
  configuration,
  file,
  highlighter,
  language,
  line,
  lineNumberWidth,
  terminalWidth,
  theme,
}: RenderPierreDiffLineParams): string {
  const unifiedLine = resolveUnifiedDiffLine(file, line)

  return renderUnifiedDiffLine({
    configuration,
    highlighter,
    language,
    line: unifiedLine,
    lineNumberWidth,
    terminalWidth,
    theme,
  })
}

function renderUnifiedDiffLine({
  configuration,
  highlighter,
  language,
  line,
  lineNumberWidth,
  terminalWidth,
  theme,
}: RenderUnifiedDiffLineParams): string {
  const backgroundColor = getBackgroundColor(line.kind)
  const sign = getChangeSign(line.kind)
  const normalizedContent = stripLineEnding(line.content)
  const gutter = renderGutter({
    backgroundColor,
    lineNumber: line.lineNumber,
    lineNumberWidth,
    lineNumbers: configuration["line-numbers"],
    sign,
  })
  const renderedContent = tokenizeLine({
    highlighter,
    language,
    theme,
    content: normalizedContent,
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
  theme: BundledTheme
}

function tokenizeLine({
  content,
  highlighter,
  language,
  theme,
}: TokenizeLineParams) {
  if (content === "") {
    return []
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

function renderPatchMetadata(patchMetadata: string | undefined): string[] {
  if (patchMetadata == null || patchMetadata.trim() === "") {
    return []
  }

  return patchMetadata
    .trimEnd()
    .split(/\r?\n/)
    .map((line) =>
      emitStyledText({
        text: line,
        foregroundColor: "#8b949e",
      }),
    )
}

function emitFileHeader(file: FileDiffMetadata): string {
  return emitStyledText({
    text: `diff ${formatFileName(file)}`,
    foregroundColor: "#79b8ff",
    bold: true,
  })
}

function emitHunkHeader(hunk: Hunk): string {
  return emitStyledText({
    text: stripLineEnding(hunk.hunkSpecs ?? "@@"),
    foregroundColor: "#d2a8ff",
  })
}

function emitCollapsedLineCount(collapsedLineCount: number): string {
  return emitStyledText({
    text: `... ${collapsedLineCount} hidden line(s) ...`,
    foregroundColor: "#8b949e",
  })
}

type EmitNoNewlineMarkerParams = {
  configuration: SuisekiConfig
  lineNumberWidth: number
}

function emitNoNewlineMarker({
  configuration,
  lineNumberWidth,
}: EmitNoNewlineMarkerParams): string {
  const gutter = renderGutter({
    lineNumberWidth,
    lineNumbers: configuration["line-numbers"],
    sign: " ",
  })

  return `${gutter.text}${emitStyledText({
    text: "\\ No newline at end of file",
    foregroundColor: "#8b949e",
  })}${RESET}`
}

function formatFileName(file: FileDiffMetadata): string {
  if (file.prevName != null && file.prevName !== file.name) {
    return `${file.prevName} -> ${file.name}`
  }

  return file.name
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

function getBackgroundColor(kind: DiffLineKind): string | undefined {
  if (kind === "addition") {
    return DIFF_BACKGROUND_COLORS.addition
  }

  if (kind === "deletion") {
    return DIFF_BACKGROUND_COLORS.deletion
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
