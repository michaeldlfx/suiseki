import { emitStyledText } from "../ansi"
import type { SuisekiConfig } from "../config"
import { renderGutter } from "../gutter"
import type { ThemePalette } from "../theme-palette"
import {
  prepareRenderContext,
  type RenderContext,
  type RenderLanguage,
  renderTokenizedContent,
  resolveLanguageForFile,
  stripLineEnding,
} from "./highlight"

type RenderFileViewParams = {
  configuration: SuisekiConfig
  content: string
  fileName: string
}

export type FileView = {
  contentLines: string[]
  headerLine: string | null
}

type BuildFileViewParams = {
  configuration: SuisekiConfig
  content: string
  context: RenderContext
  fileName: string
}

// Renders a file into a header line (or null) plus one styled line per source
// line, given an already-prepared render context. Shared by the plain viewer
// and the `--with-tree` side-by-side layout.
export async function buildFileView({
  configuration,
  content,
  context,
  fileName,
}: BuildFileViewParams): Promise<FileView> {
  const lines = splitIntoLines(content)
  const maxFileLines = configuration.shiki["max-file-lines"]
  const exceedsFileLineLimit = lines.length > maxFileLines
  // Grammar tokenization dominates the cost on large files; drop to plaintext
  // (no grammar) above the configured line limit, mirroring the diff pipeline.
  const language = exceedsFileLineLimit
    ? "plaintext"
    : await resolveLanguageForFile(context.highlighter, fileName)
  const lineNumberWidth = Math.max(String(lines.length).length, 1)

  const headerLine = configuration.pierre["file-header"]
    ? emitFileHeader({
        byteLength: Buffer.byteLength(content, "utf8"),
        fileName,
        highlightingSkippedLimit: exceedsFileLineLimit
          ? maxFileLines
          : undefined,
        language,
        palette: context.palette,
        terminalWidth: context.terminalWidth,
      })
    : null

  const contentLines = lines.map((line, lineIndex) =>
    renderFileLine({
      configuration,
      context,
      language,
      line: line ?? "",
      lineNumber: lineIndex + 1,
      lineNumberWidth,
    }),
  )

  return { contentLines, headerLine }
}

// Yields the optional header block, then one rendered line per source line, so
// a consumer can stream to stdout and stop early (e.g. `sat huge.log | head`)
// without rendering lines nobody will read.
export async function* streamFileViewLines({
  configuration,
  content,
  fileName,
}: RenderFileViewParams): AsyncGenerator<string> {
  const context = await prepareRenderContext(configuration)
  const { contentLines, headerLine } = await buildFileView({
    configuration,
    content,
    context,
    fileName,
  })

  if (headerLine != null) {
    yield headerLine
    yield ""
  }
  for (const line of contentLines) {
    yield line
  }
}

export async function renderFileView(
  params: RenderFileViewParams,
): Promise<string> {
  const lines: string[] = []
  for await (const line of streamFileViewLines(params)) {
    lines.push(line)
  }
  return lines.join("\n")
}

type RenderFileLineParams = {
  configuration: SuisekiConfig
  context: RenderContext
  language: RenderLanguage
  line: string
  lineNumber: number
  lineNumberWidth: number
}

function renderFileLine({
  configuration,
  context,
  language,
  line,
  lineNumber,
  lineNumberWidth,
}: RenderFileLineParams): string {
  const gutter = renderGutter({
    gutterForegroundColor: context.palette.dimmed,
    lineNumber,
    lineNumberWidth,
    lineNumbers: configuration.pierre["line-numbers"],
    marker: " ",
    markerForegroundColor: context.palette.dimmed,
  })
  const renderedContent = renderTokenizedContent({
    content: stripLineEnding(line),
    highlighter: context.highlighter,
    inlineHighlightRanges: [],
    language,
    maxLineLength: configuration.shiki["max-line-length"],
    theme: context.themeName,
  })
  return `${gutter.text}${renderedContent}`
}

type EmitFileHeaderParams = {
  byteLength: number
  fileName: string
  highlightingSkippedLimit?: number
  language: RenderLanguage
  palette: ThemePalette
  terminalWidth: number
}

function emitFileHeader({
  byteLength,
  fileName,
  highlightingSkippedLimit,
  language,
  palette,
  terminalWidth,
}: EmitFileHeaderParams): string {
  const displayName = fileName === "" ? "<stdin>" : fileName
  const { directory, name } = splitPath(displayName)
  const sizeText = formatByteSize(byteLength)
  const skipNote =
    highlightingSkippedLimit != null
      ? `highlighting skipped (>${highlightingSkippedLimit} lines)`
      : undefined
  const metaText = [language, sizeText, skipNote]
    .filter((part) => part != null)
    .join("  ")

  const nameVisibleLength = directory.length + name.length
  const paddingLength = Math.max(
    terminalWidth - nameVisibleLength - metaText.length,
    2,
  )

  const directoryRendered =
    directory === ""
      ? ""
      : emitStyledText({ text: directory, foregroundColor: palette.dimmed })
  const nameRendered = emitStyledText({
    text: name,
    foregroundColor: palette.foreground,
    bold: true,
  })
  const metaRendered = emitStyledText({
    text: metaText,
    foregroundColor: palette.dimmed,
  })
  const padding = emitStyledText({ text: " ".repeat(paddingLength) })

  return `${directoryRendered}${nameRendered}${padding}${metaRendered}`
}

// Splits file content into display lines. A single trailing newline does not
// add a phantom empty final line (a file "a\nb\n" is two lines, like `cat`).
function splitIntoLines(content: string): string[] {
  if (content === "") {
    return [""]
  }

  const normalizedContent = content.endsWith("\n")
    ? content.slice(0, -1)
    : content
  return normalizedContent.split("\n")
}

function splitPath(filePath: string): { directory: string; name: string } {
  const lastSlash = filePath.lastIndexOf("/")

  if (lastSlash === -1) {
    return { directory: "", name: filePath }
  }

  return {
    directory: filePath.slice(0, lastSlash + 1),
    name: filePath.slice(lastSlash + 1),
  }
}

function formatByteSize(byteLength: number): string {
  if (byteLength < 1024) {
    return `${byteLength} B`
  }

  const kibibytes = byteLength / 1024
  if (kibibytes < 1024) {
    return `${kibibytes.toFixed(1)} KB`
  }

  return `${(kibibytes / 1024).toFixed(1)} MB`
}
