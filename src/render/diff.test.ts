import { describe, expect, test } from "bun:test"
import { RESET, stripAnsi } from "../ansi"
import { DEFAULT_CONFIG, type SuisekiConfig } from "../config"
import { renderDiff } from "./diff"

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

 greet("Ada")
`

function configWith(overrides: {
  pierre?: Partial<SuisekiConfig["pierre"]>
  shiki?: Partial<SuisekiConfig["shiki"]>
}): SuisekiConfig {
  return {
    pierre: { ...DEFAULT_CONFIG.pierre, ...(overrides.pierre ?? {}) },
    shiki: { ...DEFAULT_CONFIG.shiki, ...(overrides.shiki ?? {}) },
  }
}

describe("renderDiff", () => {
  test("renders a basic unified diff with headers, gutters, and backgrounds", async () => {
    const renderedDiff = await renderDiff(BASIC_DIFF, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)
    const templateInterpolation = "$" + "{name}"

    expect(plainRenderedDiff).toContain("diff src/example.ts")
    expect(plainRenderedDiff).toContain("@@ -1,5 +1,6 @@")
    expect(plainRenderedDiff).toContain('2 -    console.log("Hello " + name)')
    expect(plainRenderedDiff).toContain(
      `2 +    const message = \`Hello ${templateInterpolation}\``,
    )
    expect(plainRenderedDiff).toContain("3 +    console.info(message)")
    expect(renderedDiff).toContain(";48;2;14;46;14m")
    expect(renderedDiff).toContain(";48;2;46;14;14m")
  })

  test("ends every rendered line with an ANSI reset", async () => {
    const renderedDiff = await renderDiff(BASIC_DIFF, DEFAULT_CONFIG)
    const renderedDiffLines = renderedDiff.split("\n")

    expect(renderedDiffLines.every((line) => line.endsWith(RESET))).toEqual(
      true,
    )
  })

  test("returns an empty string for empty input", async () => {
    const renderedDiff = await renderDiff("", DEFAULT_CONFIG)

    expect(renderedDiff).toEqual("")
  })

  test("omits diff background colors when pierre.diff-background is false", async () => {
    const configuration = configWith({
      pierre: { "diff-background": false },
    })

    const renderedDiff = await renderDiff(BASIC_DIFF, configuration)

    expect(renderedDiff).not.toContain(";48;2;14;46;14m")
    expect(renderedDiff).not.toContain(";48;2;46;14;14m")
  })

  test("omits file header when pierre.file-header is false", async () => {
    const configuration = configWith({
      pierre: { "file-header": false },
    })

    const renderedDiff = await renderDiff(BASIC_DIFF, configuration)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).not.toContain("diff src/example.ts")
    expect(plainRenderedDiff).toContain("@@ -1,5 +1,6 @@")
  })

  test("omits hunk header when pierre.hunk-header is none", async () => {
    const configuration = configWith({
      pierre: { "hunk-header": "none" },
    })

    const renderedDiff = await renderDiff(BASIC_DIFF, configuration)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).not.toContain("@@ -1,5 +1,6 @@")
    expect(plainRenderedDiff).toContain("diff src/example.ts")
  })

  test("falls back to plaintext tokenization for lines exceeding shiki.max-line-length", async () => {
    const longLine = "a".repeat(200)
    const longLineDiff = `diff --git a/long.txt b/long.txt
index 1111111..2222222 100644
--- a/long.txt
+++ b/long.txt
@@ -1 +1 @@
-short
+${longLine}
`
    const configuration = configWith({
      shiki: { "max-line-length": 100 },
    })

    const renderedDiff = await renderDiff(longLineDiff, configuration)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain(longLine)
  })
})
