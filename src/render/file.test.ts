import { describe, expect, test } from "bun:test"
import { stripAnsi } from "../ansi"
import { DEFAULT_CONFIG, type SuisekiConfig } from "../config"
import { renderFileView, streamFileViewLines } from "./file"

const ANSI_ESCAPE = String.fromCharCode(27)
const BACKGROUND_ESCAPE_PATTERN = new RegExp(
  `${ANSI_ESCAPE}\\[[0-9;]*48;2;[0-9;]+m`,
  "g",
)
const FOREGROUND_ESCAPE_PATTERN = /38;2;[0-9;]+m/g

function configWith(overrides: {
  pierre?: Partial<SuisekiConfig["pierre"]>
  shiki?: Partial<SuisekiConfig["shiki"]>
  view?: Partial<SuisekiConfig["view"]>
}): SuisekiConfig {
  return {
    pierre: { ...DEFAULT_CONFIG.pierre, ...(overrides.pierre ?? {}) },
    shiki: { ...DEFAULT_CONFIG.shiki, ...(overrides.shiki ?? {}) },
    view: { ...DEFAULT_CONFIG.view, ...(overrides.view ?? {}) },
    customThemes: {},
  }
}

function countForegroundEscapes(value: string): number {
  return value.match(FOREGROUND_ESCAPE_PATTERN)?.length ?? 0
}

// Returns the visible (ANSI-stripped) lines of a rendered file view. With the
// default file header on, index 0 is the header and index 1 is the blank
// separator, so content begins at index 2.
function visibleLines(rendered: string): string[] {
  return stripAnsi(rendered).split("\n")
}

async function collectViewBlocks(params: {
  configuration: SuisekiConfig
  content: string
  fileName: string
}): Promise<string[]> {
  const blocks: string[] = []
  for await (const block of streamFileViewLines(params)) {
    blocks.push(block)
  }
  return blocks
}

describe("file.ts", () => {
  describe("renderFileView", () => {
    test("renders one numbered gutter entry per source line", async () => {
      const rendered = await renderFileView({
        configuration: configWith({}),
        content: "const a = 1\nconst b = 2\nconst c = 3\n",
        fileName: "src/example.ts",
      })
      const contentLines = visibleLines(rendered).slice(2)

      expect(contentLines.length).toEqual(3)
      expect(contentLines[0]?.trimStart().startsWith("1")).toEqual(true)
      expect(contentLines[1]?.trimStart().startsWith("2")).toEqual(true)
      expect(contentLines[2]?.trimStart().startsWith("3")).toEqual(true)
    })

    test("a single trailing newline does not add a phantom final line", async () => {
      const withTrailingNewline = await renderFileView({
        configuration: configWith({}),
        content: "alpha\nbeta\n",
        fileName: "notes.txt",
      })
      const withoutTrailingNewline = await renderFileView({
        configuration: configWith({}),
        content: "alpha\nbeta",
        fileName: "notes.txt",
      })

      expect(visibleLines(withTrailingNewline).slice(2).length).toEqual(2)
      expect(visibleLines(withoutTrailingNewline).slice(2).length).toEqual(2)
    })

    test("emits no diff background escapes", async () => {
      const rendered = await renderFileView({
        configuration: configWith({}),
        content: "const value = 42\n",
        fileName: "src/value.ts",
      })

      expect(rendered.match(BACKGROUND_ESCAPE_PATTERN)).toEqual(null)
    })

    test("includes the filename, detected language, and byte size in the header", async () => {
      const rendered = await renderFileView({
        configuration: configWith({}),
        content: 'const greeting: string = "hello"\n',
        fileName: "src/greeting.ts",
      })
      const header = visibleLines(rendered)[0] ?? ""

      expect(header).toContain("greeting.ts")
      expect(header).toContain("typescript")
      expect(header).toContain("33 B")
    })

    test("omits the header when pierre.file-header is false", async () => {
      const rendered = await renderFileView({
        configuration: configWith({ pierre: { "file-header": false } }),
        content: "const a = 1\n",
        fileName: "src/example.ts",
      })
      const lines = visibleLines(rendered)

      expect(lines.length).toEqual(1)
      expect(lines[0]).toContain("const a = 1")
    })

    test("syntax-highlights a known language more richly than plaintext", async () => {
      const code = 'const greeting: string = "hello world"\n'
      const highlighted = await renderFileView({
        configuration: configWith({}),
        content: code,
        fileName: "src/greeting.ts",
      })
      const plaintext = await renderFileView({
        configuration: configWith({}),
        content: code,
        fileName: "notes.txt",
      })

      expect(countForegroundEscapes(highlighted)).toBeGreaterThan(
        countForegroundEscapes(plaintext),
      )
    })

    test("falls back to plaintext and notes it above the file line limit", async () => {
      const rendered = await renderFileView({
        configuration: configWith({ shiki: { "max-file-lines": 2 } }),
        content: "const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\n",
        fileName: "src/example.ts",
      })
      const header = visibleLines(rendered)[0] ?? ""

      expect(header).toContain("highlighting skipped (>2 lines)")
    })

    test("renders content without a numbered gutter when line numbers are off", async () => {
      const rendered = await renderFileView({
        configuration: configWith({ pierre: { "line-numbers": false } }),
        content: "const a = 1\n",
        fileName: "src/example.ts",
      })
      const contentLine = visibleLines(rendered).slice(2)[0] ?? ""

      expect(contentLine.trimStart().startsWith("const a = 1")).toEqual(true)
    })

    test("labels piped stdin content as <stdin>", async () => {
      const rendered = await renderFileView({
        configuration: configWith({}),
        content: "plain text\n",
        fileName: "",
      })
      const header = visibleLines(rendered)[0] ?? ""

      expect(header).toContain("<stdin>")
    })
  })

  describe("streamFileViewLines", () => {
    test("yields the header, a blank separator, then one block per line", async () => {
      const blocks = await collectViewBlocks({
        configuration: configWith({}),
        content: "alpha\nbeta\n",
        fileName: "notes.txt",
      })

      expect(blocks.length).toEqual(4)
      expect(stripAnsi(blocks[0] ?? "")).toContain("notes.txt")
      expect(blocks[1]).toEqual("")
      expect(stripAnsi(blocks[2] ?? "")).toContain("alpha")
      expect(stripAnsi(blocks[3] ?? "")).toContain("beta")
    })

    test("joining streamed blocks with newlines reproduces renderFileView", async () => {
      const configuration = configWith({})
      const content = "const a = 1\nconst b = 2\n"
      const fileName = "src/example.ts"

      const blocks = await collectViewBlocks({
        configuration,
        content,
        fileName,
      })
      const rendered = await renderFileView({
        configuration,
        content,
        fileName,
      })

      expect(blocks.join("\n")).toEqual(rendered)
    })
  })
})
