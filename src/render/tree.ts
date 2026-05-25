import { emitStyledText } from "../ansi"
import type { ThemePalette } from "../theme-palette"
import { compareTreeChildren } from "../vendor/pierre/sort-children"

export type GitFileStatus =
  | "added"
  | "deleted"
  | "ignored"
  | "modified"
  | "renamed"
  | "untracked"

export type GitStatusState = {
  // treeRoot-relative file path -> status
  statusByPath: Map<string, GitFileStatus>
  // treeRoot-relative directory paths (with trailing "/") that contain changes
  directoriesWithChanges: Set<string>
}

export type TreeNode = {
  children: TreeNode[]
  isDirectory: boolean
  name: string
  // treeRoot-relative path; directories carry a trailing "/" to match the keys
  // used by git-status rollup.
  path: string
}

// Builds a nested tree from a flat list of treeRoot-relative file paths.
// Directories are inferred from path segments; empty directories never appear
// (git does not track them, and the filesystem walk emits files only).
export function buildTree(paths: readonly string[]): TreeNode {
  const root: TreeNode = {
    children: [],
    isDirectory: true,
    name: "",
    path: "",
  }
  const directoryIndex = new Map<string, TreeNode>([["", root]])

  for (const path of paths) {
    const segments = path.split("/").filter((segment) => segment !== "")
    let parent = root
    let prefix = ""

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index] as string
      const isLastSegment = index === segments.length - 1

      if (isLastSegment) {
        parent.children.push({
          children: [],
          isDirectory: false,
          name: segment,
          path: `${prefix}${segment}`,
        })
        continue
      }

      const directoryPath = `${prefix}${segment}/`
      let directoryNode = directoryIndex.get(directoryPath)
      if (directoryNode == null) {
        directoryNode = {
          children: [],
          isDirectory: true,
          name: segment,
          path: directoryPath,
        }
        parent.children.push(directoryNode)
        directoryIndex.set(directoryPath, directoryNode)
      }
      parent = directoryNode
      prefix = directoryPath
    }
  }

  sortTree(root)
  return root
}

function sortTree(node: TreeNode): void {
  node.children.sort(compareTreeChildren)
  for (const child of node.children) {
    if (child.isDirectory) {
      sortTree(child)
    }
  }
}

// Directory markers. BMP glyphs that render in any monospace font (no Nerd
// Font required): ▾ an expanded directory, ▸ a collapsed one.
const EXPANDED_DIRECTORY_ICON = "▾ "
const COLLAPSED_DIRECTORY_ICON = "▸ "

type RenderTreeParams = {
  // When provided, only directories whose path is in this set are expanded;
  // others render collapsed (▸) with their children hidden. Undefined expands
  // every directory (the plain `sat <dir>` tree). Used by the `--with-tree`
  // sidebar to reveal just the path to the viewed file.
  expandedDirectories?: ReadonlySet<string>
  gitStatus: GitStatusState | null
  // treeRoot-relative path of a file to emphasize (the file being viewed in the
  // `--with-tree` layout). Undefined for a plain tree.
  highlightPath?: string
  palette: ThemePalette
  root: TreeNode
  rootLabel: string
  showIcons: boolean
}

export function renderTreeLines({
  expandedDirectories,
  gitStatus,
  highlightPath,
  palette,
  root,
  rootLabel,
  showIcons,
}: RenderTreeParams): string[] {
  const hasStatusColumn = gitStatus != null
  const lines: string[] = [
    `${renderStatusColumn({ gitStatus, node: root, palette })}${emitStyledText({
      text: rootLabel,
      foregroundColor: palette.accent,
      bold: true,
    })}`,
  ]
  renderChildren({
    ancestorPrefix: "",
    expandedDirectories,
    gitStatus,
    hasStatusColumn,
    highlightPath,
    lines,
    nodes: root.children,
    palette,
    showIcons,
  })
  return lines
}

type RenderChildrenParams = {
  ancestorPrefix: string
  expandedDirectories: ReadonlySet<string> | undefined
  gitStatus: GitStatusState | null
  hasStatusColumn: boolean
  highlightPath: string | undefined
  lines: string[]
  nodes: TreeNode[]
  palette: ThemePalette
  showIcons: boolean
}

function renderChildren({
  ancestorPrefix,
  expandedDirectories,
  gitStatus,
  hasStatusColumn,
  highlightPath,
  lines,
  nodes,
  palette,
  showIcons,
}: RenderChildrenParams): void {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index] as TreeNode
    const isLastChild = index === nodes.length - 1
    const branch = isLastChild ? "└── " : "├── "
    const isExpandedDirectory =
      node.isDirectory &&
      (expandedDirectories == null || expandedDirectories.has(node.path))
    const statusColumn = hasStatusColumn
      ? renderStatusColumn({ gitStatus, node, palette })
      : ""
    const branchRendered = emitStyledText({
      text: `${ancestorPrefix}${branch}`,
      foregroundColor: palette.dimmed,
    })

    lines.push(
      `${statusColumn}${branchRendered}${renderNodeName({
        expanded: isExpandedDirectory,
        highlightPath,
        node,
        palette,
        showIcons,
      })}`,
    )

    if (isExpandedDirectory && node.children.length > 0) {
      renderChildren({
        ancestorPrefix: `${ancestorPrefix}${isLastChild ? "    " : "│   "}`,
        expandedDirectories,
        gitStatus,
        hasStatusColumn,
        highlightPath,
        lines,
        nodes: node.children,
        palette,
        showIcons,
      })
    }
  }
}

type RenderNodeNameParams = {
  expanded: boolean
  highlightPath: string | undefined
  node: TreeNode
  palette: ThemePalette
  showIcons: boolean
}

function renderNodeName({
  expanded,
  highlightPath,
  node,
  palette,
  showIcons,
}: RenderNodeNameParams): string {
  if (node.isDirectory) {
    const icon = showIcons
      ? expanded
        ? EXPANDED_DIRECTORY_ICON
        : COLLAPSED_DIRECTORY_ICON
      : ""
    return emitStyledText({
      text: `${icon}${node.name}/`,
      foregroundColor: palette.accent,
      bold: true,
    })
  }

  if (highlightPath != null && node.path === highlightPath) {
    return emitStyledText({
      text: node.name,
      foregroundColor: palette.accent,
      bold: true,
      underline: true,
    })
  }

  return emitStyledText({
    text: node.name,
    foregroundColor: palette.foreground,
  })
}

type RenderStatusColumnParams = {
  gitStatus: GitStatusState | null
  node: TreeNode
  palette: ThemePalette
}

// A two-cell left gutter (label + space). Files show their git status letter;
// directories that contain changes show a dimmed dot; everything else is blank.
function renderStatusColumn({
  gitStatus,
  node,
  palette,
}: RenderStatusColumnParams): string {
  if (gitStatus == null) {
    return ""
  }

  const fileStatus = node.isDirectory
    ? undefined
    : gitStatus.statusByPath.get(node.path)
  if (fileStatus != null) {
    const presentation = STATUS_PRESENTATION[fileStatus]
    return emitStyledText({
      text: `${presentation.label} `,
      foregroundColor: presentation.color(palette),
    })
  }

  if (node.isDirectory && gitStatus.directoriesWithChanges.has(node.path)) {
    return emitStyledText({ text: "· ", foregroundColor: palette.dimmed })
  }

  return "  "
}

type StatusPresentation = {
  color: (palette: ThemePalette) => string
  label: string
}

// Glyphs intentionally match the diff file-header vocabulary (see
// getFileStatusIcon in render/diff.ts) so suiseki speaks one visual language:
// Δ change, + new, - deleted, → renamed.
const STATUS_PRESENTATION: Record<GitFileStatus, StatusPresentation> = {
  added: { label: "+", color: (palette) => palette.addition },
  deleted: { label: "-", color: (palette) => palette.deletion },
  ignored: { label: "!", color: (palette) => palette.dimmed },
  modified: { label: "Δ", color: (palette) => palette.accent },
  renamed: { label: "→", color: (palette) => palette.accent },
  untracked: { label: "?", color: (palette) => palette.dimmed },
}
