import { emitStyledText, stripAnsi } from "../ansi"
import type { SuisekiConfig } from "../config"
import type { ThemePalette } from "../theme-palette"
import {
  prepareRenderContext,
  type RenderContext,
  type RenderLanguage,
  renderTokenizedContent,
  resolveLanguageForFile,
} from "./highlight"

// A line-for-line colorizer for Git's `interactive.diffFilter` (git add -p,
// git reset -p, ...). Unlike the normal diff renderer, this path never changes
// the line structure: the interactive UI counts lines to map keystrokes onto
// hunks, so output line count must equal input line count and each line must
// strip back (modulo ANSI escapes) to its original bytes. That rules out
// re-emitted headers, gutters, full-width backgrounds, inline word-diff, tab
// expansion, and whitespace normalization — all of which the normal path does.

type ContentLineKind = "addition" | "context" | "deletion"

type RenderContentLineParams = {
  body: string
  configuration: SuisekiConfig
  context: RenderContext
  kind: ContentLineKind
  language: RenderLanguage
}

export async function renderColorOnly(
  patch: string,
  configuration: SuisekiConfig,
): Promise<string> {
  const context = await prepareRenderContext(configuration)
  // Strip any incoming ANSI so classification and byte-equality are measured
  // against the bare diff, and we never double-color. Splitting on "\n" keeps
  // the exact line structure: the element after a trailing "\n" is "", so
  // rejoining with "\n" reproduces the input's newlines without adding one.
  const sourceLines = stripAnsi(patch).split("\n")
  const outputLines: string[] = []

  // File headers (`---`/`+++`/`index`/...) are only headers in the region
  // before a file's first hunk. Once inside a hunk, a leading `-`/`+` is a
  // deletion/addition, so a deleted line that itself reads `--- x` is content,
  // not a file header. Tracking this mirrors Git's own diff grammar.
  let insideHunk = false
  let language: RenderLanguage = "plaintext"

  for (const sourceLine of sourceLines) {
    const carriageReturn = sourceLine.endsWith("\r") ? "\r" : ""
    const body =
      carriageReturn === ""
        ? sourceLine
        : sourceLine.slice(0, -carriageReturn.length)

    if (body === "") {
      outputLines.push(carriageReturn)
      continue
    }

    if (body.startsWith("diff --git") || body.startsWith("diff --cc")) {
      insideHunk = false
      language = "plaintext"
      outputLines.push(
        renderMetadataLine(body, context.palette) + carriageReturn,
      )
      continue
    }

    if (body.startsWith("@@")) {
      insideHunk = true
      outputLines.push(renderHunkLine(body, context.palette) + carriageReturn)
      continue
    }

    if (insideHunk) {
      const kind = contentLineKind(body)
      if (kind == null) {
        // `\ No newline at end of file`, or any non-content line inside a hunk.
        outputLines.push(
          renderMetadataLine(body, context.palette) + carriageReturn,
        )
        continue
      }
      outputLines.push(
        renderContentLine({ body, configuration, context, kind, language }) +
          carriageReturn,
      )
      continue
    }

    // Pre-hunk header region. The `---`/`+++` lines name the file, so resolve
    // the grammar from whichever names a real path (the other is /dev/null for
    // pure additions/deletions); the last real path wins.
    if (body.startsWith("--- ") || body.startsWith("+++ ")) {
      const headerPath = extractHeaderPath(body)
      if (headerPath != null) {
        language = await resolveLanguageForFile(context.highlighter, headerPath)
      }
    }
    outputLines.push(renderMetadataLine(body, context.palette) + carriageReturn)
  }

  return outputLines.join("\n")
}

function contentLineKind(body: string): ContentLineKind | null {
  const marker = body[0]
  if (marker === "+") {
    return "addition"
  }
  if (marker === "-") {
    return "deletion"
  }
  if (marker === " ") {
    return "context"
  }
  return null
}

function renderContentLine({
  body,
  configuration,
  context,
  kind,
  language,
}: RenderContentLineParams): string {
  const { highlighter, palette, themeName } = context
  const marker = body[0] as string
  const rest = body.slice(1)
  const backgroundColor =
    configuration.pierre["diff-background"] && kind !== "context"
      ? diffBackgroundColor(kind, palette)
      : undefined

  // The leading sign keeps its place and takes the diff foreground; the rest is
  // Shiki-tokenized so syntax foregrounds and the diff background coexist. No
  // inline word-diff: it inserts tokens mid-line and would break the invariant.
  const renderedMarker = emitStyledText({
    text: marker,
    foregroundColor: markerForegroundForKind(kind, palette),
    backgroundColor,
  })
  const renderedRest = renderTokenizedContent({
    backgroundColor,
    content: rest,
    highlighter,
    inlineHighlightRanges: [],
    language,
    maxLineLength: configuration.shiki["max-line-length"],
    theme: themeName,
  })

  return `${renderedMarker}${renderedRest}`
}

function renderHunkLine(body: string, palette: ThemePalette): string {
  return emitStyledText({ text: body, foregroundColor: palette.accent })
}

function renderMetadataLine(body: string, palette: ThemePalette): string {
  return emitStyledText({ text: body, foregroundColor: palette.dimmed })
}

// Only addition/deletion lines get a background; context never does, so the
// caller narrows the kind out before calling this.
function diffBackgroundColor(
  kind: "addition" | "deletion",
  palette: ThemePalette,
): string {
  return kind === "addition"
    ? palette.additionBackground
    : palette.deletionBackground
}

function markerForegroundForKind(
  kind: ContentLineKind,
  palette: ThemePalette,
): string | undefined {
  if (kind === "addition") {
    return palette.addition
  }
  if (kind === "deletion") {
    return palette.deletion
  }
  return undefined
}

// Pull the path out of a `--- a/path` / `+++ b/path` header so the grammar can
// be resolved by extension. Returns undefined for /dev/null. The `a/`/`b/`
// prefix is dropped (and surrounding quotes from Git's path quoting), but only
// the extension matters to language detection.
function extractHeaderPath(body: string): string | undefined {
  const raw = body.slice(4).trim()
  if (raw === "" || raw === "/dev/null") {
    return undefined
  }
  const unquoted =
    raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
      ? raw.slice(1, -1)
      : raw
  if (unquoted.startsWith("a/") || unquoted.startsWith("b/")) {
    return unquoted.slice(2)
  }
  return unquoted
}
