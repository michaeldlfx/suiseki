import { describe, expect, test } from "bun:test"
import { RESET, stripAnsi } from "../ansi"
import { DEFAULT_CONFIG } from "../config"
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
})
