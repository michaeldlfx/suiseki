import { describe, expect, test } from "bun:test"
import { stripAnsi } from "../ansi"
import { DEFAULT_CONFIG, type SuisekiConfig } from "../config"
import { renderColorOnly } from "./color-only"

const BASIC_DIFF = `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,5 +1,6 @@
 export function greet(name: string) {
-  console.log("Hello " + name)
+  const message = \`Hello \${name}\`
+  console.info(message)
 }
${" "}
 greet("Ada")
`

// A deletion whose content itself begins with `--- `. Outside a hunk that is a
// file header; inside a hunk it must stay a deletion (Git counts it as one).
const HEADER_LOOKALIKE_DIFF = `diff --git a/notes.txt b/notes.txt
index 1111111..2222222 100644
--- a/notes.txt
+++ b/notes.txt
@@ -1,2 +1,1 @@
 first line
--- second line that looks like a header
`

// Header lines are LF-terminated; only the file content lines carry the CR.
const CRLF_DIFF =
  "diff --git a/win.txt b/win.txt\n" +
  "index 1111111..2222222 100644\n" +
  "--- a/win.txt\n" +
  "+++ b/win.txt\n" +
  "@@ -1 +1 @@\n" +
  "-old line\r\n" +
  "+new line\r\n"

const ADDITION_ONLY_DIFF = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/new.ts
@@ -0,0 +1 @@
+export const created = true
`

// `git diff --no-prefix` drops the a/ and b/ path prefixes from the headers.
const NO_PREFIX_DIFF = `diff --git src/example.ts src/example.ts
index 1111111..2222222 100644
--- src/example.ts
+++ src/example.ts
@@ -1 +1 @@
-const value = 1
+const value = 2
`

const NO_NEWLINE_DIFF = `diff --git a/a.txt b/a.txt
index 1111111..2222222 100644
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file
`

function backgroundColorCodes(line: string): string[] {
  return [...line.matchAll(/48;2;\d+;\d+;\d+/g)].map((match) => match[0])
}

function hasBackground(line: string): boolean {
  return backgroundColorCodes(line).length > 0
}

function hasForeground(line: string): boolean {
  return /38;2;\d+;\d+;\d+/.test(line)
}

function withWordDiff(
  wordDiff: SuisekiConfig["pierre"]["word-diff"],
): SuisekiConfig {
  return {
    ...DEFAULT_CONFIG,
    pierre: { ...DEFAULT_CONFIG.pierre, "word-diff": wordDiff },
  }
}

function assertColorizedHeader(headerLine: string): void {
  expect(hasForeground(headerLine)).toEqual(true)
  expect(hasBackground(headerLine)).toEqual(false)
}

describe("renderColorOnly", () => {
  test("output line count equals input line count", async () => {
    const renderedDiff = await renderColorOnly(BASIC_DIFF, DEFAULT_CONFIG)

    expect(renderedDiff.split("\n").length).toEqual(
      BASIC_DIFF.split("\n").length,
    )
  })

  test("each line strips back to its original bytes", async () => {
    const sourceLines = BASIC_DIFF.split("\n")
    const renderedLines = (
      await renderColorOnly(BASIC_DIFF, DEFAULT_CONFIG)
    ).split("\n")

    expect(renderedLines.map(stripAnsi)).toEqual(sourceLines)
  })

  test("classifies headers, hunk header, context, and changes", async () => {
    const renderedLines = (
      await renderColorOnly(BASIC_DIFF, DEFAULT_CONFIG)
    ).split("\n")
    const [
      gitHeader,
      indexHeader,
      oldFileHeader,
      newFileHeader,
      hunkHeader,
      contextLine,
      deletionLine,
      additionLine,
    ] = renderedLines

    for (const headerLine of [
      gitHeader,
      indexHeader,
      oldFileHeader,
      newFileHeader,
      hunkHeader,
    ]) {
      assertColorizedHeader(headerLine as string)
    }

    expect(hasBackground(contextLine as string)).toEqual(false)
    expect(hasBackground(deletionLine as string)).toEqual(true)
    expect(hasBackground(additionLine as string)).toEqual(true)
  })

  test("colors each change line with a single diff background", async () => {
    const renderedLines = (
      await renderColorOnly(BASIC_DIFF, DEFAULT_CONFIG)
    ).split("\n")
    const deletionLine = renderedLines[6] as string
    const additionLine = renderedLines[7] as string

    // One background color across the whole line: no inline word-diff splits it
    // into a second (inline) background shade.
    expect(new Set(backgroundColorCodes(deletionLine)).size).toEqual(1)
    expect(new Set(backgroundColorCodes(additionLine)).size).toEqual(1)
  })

  test("omits diff backgrounds when diff-background is disabled", async () => {
    const configuration: SuisekiConfig = {
      ...DEFAULT_CONFIG,
      pierre: { ...DEFAULT_CONFIG.pierre, "diff-background": false },
    }
    const renderedLines = (
      await renderColorOnly(BASIC_DIFF, configuration)
    ).split("\n")

    for (const renderedLine of renderedLines) {
      expect(hasBackground(renderedLine)).toEqual(false)
    }
  })

  test("does not apply inline word-diff regardless of config", async () => {
    const withoutWordDiff = await renderColorOnly(
      BASIC_DIFF,
      withWordDiff("none"),
    )
    const withWordAlt = await renderColorOnly(
      BASIC_DIFF,
      withWordDiff("word-alt"),
    )
    const withCharDiff = await renderColorOnly(BASIC_DIFF, withWordDiff("char"))

    expect(withWordAlt).toEqual(withoutWordDiff)
    expect(withCharDiff).toEqual(withoutWordDiff)
  })

  test("treats a deleted header-lookalike line as a deletion", async () => {
    const sourceLines = HEADER_LOOKALIKE_DIFF.split("\n")
    const renderedLines = (
      await renderColorOnly(HEADER_LOOKALIKE_DIFF, DEFAULT_CONFIG)
    ).split("\n")
    const realFileHeader = renderedLines[2] as string
    const deletedLookalike = renderedLines[6] as string

    expect(renderedLines.map(stripAnsi)).toEqual(sourceLines)
    // The pre-hunk `--- notes.txt` is a header (no background); the in-hunk
    // `--- second line ...` is a deletion (gets a background).
    expect(hasBackground(realFileHeader)).toEqual(false)
    expect(hasBackground(deletedLookalike)).toEqual(true)
    expect(stripAnsi(deletedLookalike)).toEqual(
      "--- second line that looks like a header",
    )
  })

  test("preserves CRLF line endings byte-for-byte", async () => {
    const sourceLines = CRLF_DIFF.split("\n")
    const renderedLines = (
      await renderColorOnly(CRLF_DIFF, DEFAULT_CONFIG)
    ).split("\n")
    const renderedDeletion = renderedLines[5] as string

    expect(renderedLines.map(stripAnsi)).toEqual(sourceLines)
    expect(stripAnsi(renderedDeletion).endsWith("\r")).toEqual(true)
  })

  test("handles /dev/null sides without losing lines", async () => {
    const sourceLines = ADDITION_ONLY_DIFF.split("\n")
    const renderedLines = (
      await renderColorOnly(ADDITION_ONLY_DIFF, DEFAULT_CONFIG)
    ).split("\n")
    const additionLine = renderedLines[6] as string

    expect(renderedLines.map(stripAnsi)).toEqual(sourceLines)
    expect(hasBackground(additionLine)).toEqual(true)
  })

  test("resolves the grammar from unprefixed (--no-prefix) headers", async () => {
    const sourceLines = NO_PREFIX_DIFF.split("\n")
    const renderedLines = (
      await renderColorOnly(NO_PREFIX_DIFF, DEFAULT_CONFIG)
    ).split("\n")
    const additionLine = renderedLines[6] as string

    expect(renderedLines.map(stripAnsi)).toEqual(sourceLines)
    expect(hasBackground(additionLine)).toEqual(true)
  })

  test("passes through no-newline markers inside a hunk without a background", async () => {
    const sourceLines = NO_NEWLINE_DIFF.split("\n")
    const renderedLines = (
      await renderColorOnly(NO_NEWLINE_DIFF, DEFAULT_CONFIG)
    ).split("\n")
    const noNewlineMarker = renderedLines[6] as string

    expect(renderedLines.map(stripAnsi)).toEqual(sourceLines)
    expect(stripAnsi(noNewlineMarker)).toEqual("\\ No newline at end of file")
    // The `\ No newline` marker is metadata, not a deletion/addition line.
    expect(hasBackground(noNewlineMarker)).toEqual(false)
  })
})
