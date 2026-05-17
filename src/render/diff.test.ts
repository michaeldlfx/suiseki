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

    expect(plainRenderedDiff).toContain("src/example.ts")
    expect(plainRenderedDiff).toContain('2 -    console.log("Hello " + name)')
    expect(plainRenderedDiff).toContain(
      `2 +    const message = \`Hello ${templateInterpolation}\``,
    )
    expect(plainRenderedDiff).toContain("3 +    console.info(message)")
    expect(renderedDiff).toContain(";48;2;14;46;14m")
    expect(renderedDiff).toContain(";48;2;46;14;14m")
  })

  test("file header includes change summary with deletion and addition counts", async () => {
    const renderedDiff = await renderDiff(BASIC_DIFF, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("src/example.ts")
    expect(plainRenderedDiff).toContain("-1 +2")
  })

  test("does not show hunk header by default", async () => {
    const renderedDiff = await renderDiff(BASIC_DIFF, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).not.toContain("@@")
  })

  test("shows hunk header when pierre.hunk-header is full", async () => {
    const configuration = configWith({
      pierre: { "hunk-header": "full" },
    })

    const renderedDiff = await renderDiff(BASIC_DIFF, configuration)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("@@ -1,5 +1,6 @@")
  })

  test("ends every non-empty rendered line with an ANSI reset", async () => {
    const renderedDiff = await renderDiff(BASIC_DIFF, DEFAULT_CONFIG)
    const nonEmptyLines = renderedDiff.split("\n").filter((line) => line !== "")

    expect(nonEmptyLines.every((line) => line.endsWith(RESET))).toEqual(true)
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

    expect(plainRenderedDiff).not.toContain("src/example.ts")
  })

  test("file header shows status icon for modified file", async () => {
    const renderedDiff = await renderDiff(BASIC_DIFF, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("Δ src/example.ts")
  })

  test("file header shows filename bold and directory dimmed", async () => {
    const renderedDiff = await renderDiff(BASIC_DIFF, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("src/")
    expect(plainRenderedDiff).toContain("example.ts")
  })

  test("file header shows + icon for new files", async () => {
    const newFileDiff = `diff --git a/new-file.ts b/new-file.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1 @@
+console.log("new")
`
    const renderedDiff = await renderDiff(newFileDiff, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("+ new-file.ts")
  })

  test("file header shows - icon for deleted files", async () => {
    const deletedFileDiff = `diff --git a/old-file.ts b/old-file.ts
deleted file mode 100644
index 1111111..0000000
--- a/old-file.ts
+++ /dev/null
@@ -1 +0,0 @@
-console.log("old")
`
    const renderedDiff = await renderDiff(deletedFileDiff, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("- old-file.ts")
  })

  test("adds blank line between files in multi-file diff", async () => {
    const multiFileDiff = `diff --git a/file-a.ts b/file-a.ts
index 1111111..2222222 100644
--- a/file-a.ts
+++ b/file-a.ts
@@ -1 +1 @@
-const a = 1
+const a = 2
diff --git a/file-b.ts b/file-b.ts
index 3333333..4444444 100644
--- a/file-b.ts
+++ b/file-b.ts
@@ -1 +1 @@
-const b = 1
+const b = 2
`
    const renderedDiff = await renderDiff(multiFileDiff, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("file-a.ts")
    expect(plainRenderedDiff).toContain("file-b.ts")

    const lines = renderedDiff.split("\n")
    const fileAHeaderIndex = lines.findIndex((line) =>
      stripAnsi(line).includes("file-a.ts"),
    )
    const fileBHeaderIndex = lines.findIndex((line) =>
      stripAnsi(line).includes("file-b.ts"),
    )
    const lineBetween = lines[fileBHeaderIndex - 1]

    expect(fileAHeaderIndex).not.toEqual(-1)
    expect(fileBHeaderIndex).not.toEqual(-1)
    expect(lineBetween).toEqual("")
  })

  test("file header shows → icon and both paths for renamed files", async () => {
    const renamedFileDiff = `diff --git a/old-name.ts b/new-name.ts
similarity index 100%
rename from old-name.ts
rename to new-name.ts
`
    const renderedDiff = await renderDiff(renamedFileDiff, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("→ old-name.ts")
    expect(plainRenderedDiff).toContain("old-name.ts")
    expect(plainRenderedDiff).toContain("new-name.ts")
  })

  test("file header shows → icon for renamed file with content changes", async () => {
    const renamedChangedDiff = `diff --git a/src/old.ts b/src/new.ts
similarity index 50%
rename from src/old.ts
rename to src/new.ts
index 1111111..2222222 100644
--- a/src/old.ts
+++ b/src/new.ts
@@ -1 +1 @@
-const x = 1
+const x = 2
`
    const renderedDiff = await renderDiff(renamedChangedDiff, DEFAULT_CONFIG)
    const plainRenderedDiff = stripAnsi(renderedDiff)

    expect(plainRenderedDiff).toContain("→")
    expect(plainRenderedDiff).toContain("src/old.ts")
    expect(plainRenderedDiff).toContain("src/new.ts")
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
