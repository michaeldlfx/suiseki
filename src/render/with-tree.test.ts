import { describe, expect, test } from "bun:test"
import { stripAnsi } from "../ansi"
import { DEFAULT_CONFIG, type SuisekiConfig } from "../config"
import { getTerminalWidth } from "./highlight"
import { computeTreeLayout, expandTabs, renderWithTreeLines } from "./with-tree"

function defaultConfig(): SuisekiConfig {
  return {
    pierre: DEFAULT_CONFIG.pierre,
    shiki: DEFAULT_CONFIG.shiki,
    view: DEFAULT_CONFIG.view,
    customThemes: {},
  }
}

// Supplies the required params with sensible defaults so each test overrides
// only what it exercises (notably `side`, which every call now requires).
function renderRows(
  overrides: Partial<Parameters<typeof renderWithTreeLines>[0]>,
): Promise<string[]> {
  return renderWithTreeLines({
    configuration: defaultConfig(),
    content: "x\n",
    expandedDirectories: new Set<string>(),
    fileName: "render/file.ts",
    gitStatus: null,
    highlightPath: "file.ts",
    paths: ["file.ts"],
    rootLabel: "render",
    showIcons: false,
    side: "left",
    ...overrides,
  })
}

describe("expandTabs", () => {
  test("expands a tab to the next tab stop", () => {
    // "a" sits in column 1, so the tab fills the 7 cells up to column 8.
    expect(expandTabs("a\tb", 8)).toEqual(`a${" ".repeat(7)}b`)
  })

  test("resets tab stops at each newline", () => {
    // Line 1: "ab" -> tab fills to column 8 (6 cells). Line 2: tab from column 0.
    expect(expandTabs("ab\tc\n\td", 8)).toEqual(
      `ab${" ".repeat(6)}c\n${" ".repeat(8)}d`,
    )
  })

  test("leaves a string without tabs unchanged", () => {
    expect(expandTabs("no tabs here", 8)).toEqual("no tabs here")
  })
})

describe("computeTreeLayout", () => {
  test("fits the tree to its widest line when it fits within half the width", () => {
    const layout = computeTreeLayout({ terminalWidth: 140, widestTreeLine: 49 })

    // available = 140 - 3 = 137; 49 < floor(137 / 2), so the full tree fits.
    expect(layout.treeColumnWidth).toEqual(49)
    expect(layout.fileColumnWidth).toEqual(88)
  })

  test("caps the tree at half the width so the file keeps the larger share", () => {
    const layout = computeTreeLayout({
      terminalWidth: 100,
      widestTreeLine: 200,
    })

    // available = 97; the tree is capped at floor(97 / 2) = 48, file gets 49.
    expect(layout.treeColumnWidth).toEqual(48)
    expect(layout.fileColumnWidth).toEqual(49)
  })

  test("never narrows the file below the tree, even for an extremely wide tree", () => {
    const narrow = computeTreeLayout({
      terminalWidth: 100,
      widestTreeLine: 999,
    })
    const wide = computeTreeLayout({ terminalWidth: 200, widestTreeLine: 999 })

    expect(narrow.fileColumnWidth).toBeGreaterThanOrEqual(
      narrow.treeColumnWidth,
    )
    expect(wide.fileColumnWidth).toBeGreaterThanOrEqual(wide.treeColumnWidth)
  })
})

describe("renderWithTreeLines", () => {
  test("places the tree on the left and file content on the right of a separator", async () => {
    const rows = await renderRows({
      content: "const answer = 42\n",
      paths: ["file.ts", "tree.ts"],
      showIcons: true,
    })
    const firstRow = stripAnsi(rows[0] ?? "")

    expect(firstRow).toContain("render")
    expect(firstRow).toContain("│")
    expect(firstRow).toContain("const answer")
    expect(firstRow.indexOf("render")).toBeLessThan(
      firstRow.indexOf("const answer"),
    )
  })

  test("places the tree on the right and file content on the left when side is right", async () => {
    const rows = await renderRows({
      content: "const answer = 42\n",
      paths: ["file.ts", "tree.ts"],
      showIcons: true,
      side: "right",
    })
    const firstRow = stripAnsi(rows[0] ?? "")

    expect(firstRow).toContain("render")
    expect(firstRow).toContain("│")
    expect(firstRow).toContain("const answer")
    expect(firstRow.indexOf("const answer")).toBeLessThan(
      firstRow.indexOf("render"),
    )
  })

  test("keeps emitting file rows after the tree column is exhausted", async () => {
    const rows = await renderRows({ content: "a\nb\nc\nd\ne\nf\n" })

    // max(2 tree rows: root + one child, 6 file rows) = 6
    expect(rows.length).toEqual(6)
    const lastRow = stripAnsi(rows[5] ?? "")
    expect(lastRow.trimStart().startsWith("│")).toEqual(true)
    expect(lastRow).toContain("f")
  })

  test("truncates long file lines so they never exceed the terminal width", async () => {
    const rows = await renderRows({ content: `${"x".repeat(500)}\n` })

    // The 500-char line must be truncated so the row never exceeds the terminal
    // width the renderer used (read from process.stdout, so assert against the
    // same source rather than a hard-coded width that breaks on a wide TTY).
    expect(stripAnsi(rows[0] ?? "").length).toBeLessThanOrEqual(
      getTerminalWidth(),
    )
  })

  test("expands only the directories on the path to the file and collapses the rest", async () => {
    const rows = await renderRows({
      expandedDirectories: new Set(["src/"]),
      fileName: "src/file.ts",
      highlightPath: "src/file.ts",
      paths: ["src/file.ts", "src/nested/deep.ts", "other/thing.ts"],
      rootLabel: ".",
      showIcons: true,
    })
    const plain = rows.map((row) => stripAnsi(row)).join("\n")

    expect(plain).toContain("▾ src/")
    expect(plain).toContain("file.ts")
    expect(plain).toContain("▸ nested/")
    expect(plain).toContain("▸ other/")
    // Collapsed directories hide their children.
    expect(plain).not.toContain("deep.ts")
    expect(plain).not.toContain("thing.ts")
  })
})
