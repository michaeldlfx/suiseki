import { describe, expect, test } from "bun:test"
import { stripAnsi } from "../ansi"
import { DEFAULT_CONFIG, type SuisekiConfig } from "../config"
import {
  containsMergeConflictMarkers,
  renderMergeConflictFile,
} from "./merge-conflict"

const TWO_WAY_CONFLICT = `function greet(name) {
<<<<<<< HEAD
  console.log("Hello " + name)
=======
  console.log(\`Hello \${name}\`)
>>>>>>> feature
}
`

const DIFF3_CONFLICT = `const a = 1
<<<<<<< HEAD
const b = 2
||||||| base
const b = 0
=======
const b = 3
>>>>>>> feature
const c = 4
`

const REGULAR_DIFF = `diff --git a/x.ts b/x.ts
index 1..2 100644
--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-const a = 1
+const a = 2
`

function configWith(overrides: {
  pierre?: Partial<SuisekiConfig["pierre"]>
}): SuisekiConfig {
  return {
    pierre: { ...DEFAULT_CONFIG.pierre, ...(overrides.pierre ?? {}) },
    shiki: DEFAULT_CONFIG.shiki,
    customThemes: {},
  }
}

describe("merge-conflict.ts", () => {
  describe("containsMergeConflictMarkers", () => {
    test("detects a standard two-way conflict marker at line start", () => {
      expect(containsMergeConflictMarkers(TWO_WAY_CONFLICT)).toEqual(true)
    })

    test("detects diff3-style conflict (base marker still uses <<<<<<<)", () => {
      expect(containsMergeConflictMarkers(DIFF3_CONFLICT)).toEqual(true)
    })

    test("returns false for a regular git diff", () => {
      expect(containsMergeConflictMarkers(REGULAR_DIFF)).toEqual(false)
    })

    test("returns false for plain source code without markers", () => {
      expect(
        containsMergeConflictMarkers("function f() { return 1 }\n"),
      ).toEqual(false)
    })

    test("ignores <<<<<<< when not at start of line", () => {
      expect(containsMergeConflictMarkers("// <<<<<<< not a marker\n")).toEqual(
        false,
      )
    })
  })

  describe("renderMergeConflictFile", () => {
    test("renders current side as deletions and incoming side as additions", async () => {
      const rendered = await renderMergeConflictFile({
        configuration: DEFAULT_CONFIG,
        content: TWO_WAY_CONFLICT,
      })
      const plain = stripAnsi(rendered)
      const templateInterpolation = "$" + "{name}"

      expect(plain).toContain('console.log("Hello " + name)')
      expect(plain).toContain(`console.log(\`Hello ${templateInterpolation}\`)`)
      expect(plain).toContain(" 2 -")
      expect(plain).toContain(" 2 +")
    })

    test("strips conflict markers from rendered output", async () => {
      const rendered = await renderMergeConflictFile({
        configuration: DEFAULT_CONFIG,
        content: TWO_WAY_CONFLICT,
      })
      const plain = stripAnsi(rendered)

      expect(plain).not.toContain("<<<<<<<")
      expect(plain).not.toContain("=======")
      expect(plain).not.toContain(">>>>>>>")
    })

    test("treats diff3 base section as shared context", async () => {
      const rendered = await renderMergeConflictFile({
        configuration: DEFAULT_CONFIG,
        content: DIFF3_CONFLICT,
      })
      const plain = stripAnsi(rendered)

      expect(plain).toContain("const b = 2")
      expect(plain).toContain("const b = 0")
      expect(plain).toContain("const b = 3")
    })

    test("uses a placeholder filename when none is supplied", async () => {
      const rendered = await renderMergeConflictFile({
        configuration: DEFAULT_CONFIG,
        content: TWO_WAY_CONFLICT,
      })
      const plain = stripAnsi(rendered)

      expect(plain).toContain("<merge conflict>")
    })

    test("uses the provided name in the file header", async () => {
      const rendered = await renderMergeConflictFile({
        configuration: DEFAULT_CONFIG,
        content: TWO_WAY_CONFLICT,
        name: "src/greet.ts",
      })
      const plain = stripAnsi(rendered)

      expect(plain).toContain("greet.ts")
    })

    test("respects pierre.view = split", async () => {
      const rendered = await renderMergeConflictFile({
        configuration: configWith({ pierre: { view: "split" } }),
        content: TWO_WAY_CONFLICT,
      })
      const plain = stripAnsi(rendered)

      // Split view emits a vertical separator between deletion and addition columns.
      expect(plain).toContain("│")
    })
  })
})
