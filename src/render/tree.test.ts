import { describe, expect, test } from "bun:test"
import { stripAnsi } from "../ansi"
import type { ThemePalette } from "../theme-palette"
import { buildTree, type GitStatusState, renderTreeLines } from "./tree"

const PALETTE: ThemePalette = {
  foreground: "#ffffff",
  dimmed: "#888888",
  addition: "#00ff00",
  deletion: "#ff0000",
  accent: "#8888ff",
  additionBackground: "#003300",
  additionInlineBackground: "#004400",
  deletionBackground: "#330000",
  deletionInlineBackground: "#440000",
  separatorForeground: "#666666",
  separatorBackground: "#222222",
}

const ACCENT_ESCAPE = "38;2;136;136;255"

function plainTreeLines(params: {
  gitStatus: GitStatusState | null
  root: ReturnType<typeof buildTree>
  rootLabel: string
  showIcons: boolean
}): string[] {
  return renderTreeLines({ ...params, palette: PALETTE }).map(stripAnsi)
}

describe("tree.ts", () => {
  describe("buildTree", () => {
    test("infers intermediate directories from file paths", () => {
      const root = buildTree(["src/render/tree.ts"])

      expect(root.children.length).toEqual(1)
      expect(root.children[0]?.name).toEqual("src")
      expect(root.children[0]?.isDirectory).toEqual(true)
      expect(root.children[0]?.children[0]?.name).toEqual("render")
      expect(root.children[0]?.children[0]?.children[0]?.name).toEqual(
        "tree.ts",
      )
    })

    test("orders folders before files, dotfiles first, then alphabetically", () => {
      const root = buildTree(["b/file2.ts", "a.txt", "b/file1.ts", ".env"])

      expect(root.children.map((child) => child.name)).toEqual([
        "b",
        ".env",
        "a.txt",
      ])
      expect(root.children[0]?.children.map((child) => child.name)).toEqual([
        "file1.ts",
        "file2.ts",
      ])
    })

    test("sorts case-insensitively", () => {
      const root = buildTree(["Zebra.ts", "apple.ts"])

      expect(root.children.map((child) => child.name)).toEqual([
        "apple.ts",
        "Zebra.ts",
      ])
    })
  })

  describe("renderTreeLines", () => {
    test("draws the root label, branch characters, dir slashes, and the ▾ icon", () => {
      const root = buildTree(["src/cli.ts", "src/render/tree.ts", "README.md"])
      const lines = plainTreeLines({
        gitStatus: null,
        root,
        rootLabel: ".",
        showIcons: true,
      })

      expect(lines).toEqual([
        ".",
        "├── ▾ src/",
        "│   ├── ▾ render/",
        "│   │   └── tree.ts",
        "│   └── cli.ts",
        "└── README.md",
      ])
    })

    test("omits the ▾ icon when showIcons is false", () => {
      const root = buildTree(["src/cli.ts", "README.md"])
      const lines = plainTreeLines({
        gitStatus: null,
        root,
        rootLabel: ".",
        showIcons: false,
      })

      expect(lines).toEqual([
        ".",
        "├── src/",
        "│   └── cli.ts",
        "└── README.md",
      ])
    })

    test("renders a git status column with file labels and directory rollup", () => {
      const root = buildTree(["src/cli.ts", "new.ts", "README.md"])
      const gitStatus: GitStatusState = {
        statusByPath: new Map([
          ["src/cli.ts", "modified"],
          ["new.ts", "untracked"],
        ]),
        directoriesWithChanges: new Set(["src/"]),
      }
      const lines = plainTreeLines({
        gitStatus,
        root,
        rootLabel: ".",
        showIcons: true,
      })

      expect(lines).toEqual([
        "  .",
        "· ├── ▾ src/",
        "Δ │   └── cli.ts",
        "? ├── new.ts",
        "  └── README.md",
      ])
    })

    test("colors the status label with the matching palette color", () => {
      const root = buildTree(["src/cli.ts"])
      const gitStatus: GitStatusState = {
        statusByPath: new Map([["src/cli.ts", "modified"]]),
        directoriesWithChanges: new Set(["src/"]),
      }
      const renderedLines = renderTreeLines({
        gitStatus,
        palette: PALETTE,
        root,
        rootLabel: ".",
        showIcons: true,
      })
      const modifiedLine = renderedLines.find((line) =>
        stripAnsi(line).includes("cli.ts"),
      )

      expect(modifiedLine).toContain(ACCENT_ESCAPE)
    })

    test("labels and colors the added, deleted, ignored, and renamed statuses", () => {
      const root = buildTree([
        "added.ts",
        "deleted.ts",
        "ignored.ts",
        "renamed.ts",
      ])
      const gitStatus: GitStatusState = {
        statusByPath: new Map([
          ["added.ts", "added"],
          ["deleted.ts", "deleted"],
          ["ignored.ts", "ignored"],
          ["renamed.ts", "renamed"],
        ]),
        directoriesWithChanges: new Set(),
      }
      const renderedLines = renderTreeLines({
        gitStatus,
        palette: PALETTE,
        root,
        rootLabel: ".",
        showIcons: true,
      })

      expect(renderedLines.map(stripAnsi)).toEqual([
        "  .",
        "+ ├── added.ts",
        "- ├── deleted.ts",
        "! ├── ignored.ts",
        "→ └── renamed.ts",
      ])

      const lineFor = (fileName: string): string | undefined =>
        renderedLines.find((line) => stripAnsi(line).includes(fileName))
      expect(lineFor("added.ts")).toContain("38;2;0;255;0")
      expect(lineFor("deleted.ts")).toContain("38;2;255;0;0")
      expect(lineFor("ignored.ts")).toContain("38;2;136;136;136")
      expect(lineFor("renamed.ts")).toContain(ACCENT_ESCAPE)
    })

    test("emphasizes the file at highlightPath with the accent color", () => {
      const root = buildTree(["file.ts", "other.ts"])
      const highlighted = renderTreeLines({
        gitStatus: null,
        highlightPath: "file.ts",
        palette: PALETTE,
        root,
        rootLabel: ".",
        showIcons: false,
      })
      const plain = renderTreeLines({
        gitStatus: null,
        palette: PALETTE,
        root,
        rootLabel: ".",
        showIcons: false,
      })
      const matchesFileTs = (line: string): boolean => {
        const text = stripAnsi(line)
        return text.includes("file.ts") && !text.includes("other")
      }
      const highlightedLine = highlighted.find(matchesFileTs)
      const plainLine = plain.find(matchesFileTs)

      expect(highlightedLine).toContain(ACCENT_ESCAPE)
      expect(plainLine).not.toContain(ACCENT_ESCAPE)
    })

    test("omits the status column entirely when gitStatus is null", () => {
      const root = buildTree(["README.md"])
      const lines = plainTreeLines({
        gitStatus: null,
        root,
        rootLabel: ".",
        showIcons: true,
      })

      expect(lines[0]).toEqual(".")
      expect(lines[1]).toEqual("└── README.md")
    })
  })
})
