import { emitStyledText, fitToWidth, visibleWidth } from "../ansi"
import type { SuisekiConfig } from "../config"
import { buildFileView } from "./file"
import { prepareRenderContext } from "./highlight"
import { buildTree, type GitStatusState, renderTreeLines } from "./tree"

// Below this terminal width the side-by-side layout is too cramped; callers fall
// back to the plain file view.
export const MIN_WIDTH_FOR_TREE = 100
const SEPARATOR = " │ "

type TreeLayout = { fileColumnWidth: number; treeColumnWidth: number }

// Splits the available width (terminal minus the separator) between the two
// columns. The file is the main content, so it always keeps at least half: the
// tree never takes more than half the available width, and within that it takes
// only what its widest line needs. So the file is never narrowed to fit the
// tree, and tree names are only truncated when the tree itself exceeds its half.
export function computeTreeLayout(params: {
  terminalWidth: number
  widestTreeLine: number
}): TreeLayout {
  const available = Math.max(params.terminalWidth - SEPARATOR.length, 2)
  const treeColumnWidth = Math.min(
    params.widestTreeLine,
    Math.floor(available / 2),
  )
  return { treeColumnWidth, fileColumnWidth: available - treeColumnWidth }
}

type RenderWithTreeParams = {
  configuration: SuisekiConfig
  content: string
  // Directories to expand (the ancestors of the viewed file); all others
  // collapse so the file stays prominent.
  expandedDirectories: ReadonlySet<string>
  fileName: string
  gitStatus: GitStatusState | null
  highlightPath: string
  paths: string[]
  rootLabel: string
  showIcons: boolean
  side: "left" | "right"
}

// Side-by-side layout: the surrounding directory tree on one side (current file
// highlighted), the file's contents on the other. `side` chooses which side the
// tree sits on. The tree column is fixed width; the file column takes the rest
// and is truncated so long lines never wrap into the tree column.
export async function renderWithTreeLines({
  configuration,
  content,
  expandedDirectories,
  fileName,
  gitStatus,
  highlightPath,
  paths,
  rootLabel,
  showIcons,
  side,
}: RenderWithTreeParams): Promise<string[]> {
  const context = await prepareRenderContext(configuration)
  const { contentLines } = await buildFileView({
    configuration,
    content,
    context,
    fileName,
  })
  const treeLines = renderTreeLines({
    expandedDirectories,
    gitStatus,
    highlightPath,
    palette: context.palette,
    root: buildTree(paths),
    rootLabel,
    showIcons,
  })

  const widestTreeLine = treeLines.reduce(
    (widest, line) => Math.max(widest, visibleWidth(line)),
    0,
  )
  const { fileColumnWidth, treeColumnWidth } = computeTreeLayout({
    terminalWidth: context.terminalWidth,
    widestTreeLine,
  })
  const separator = emitStyledText({
    text: SEPARATOR,
    foregroundColor: context.palette.separatorForeground,
  })
  const rowCount = Math.max(treeLines.length, contentLines.length)
  const rows: string[] = []

  // Only the left cell is padded to its column width; the right cell needs no
  // trailing fill. So the cell that lands on the left is padded, the other is not.
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const treeLine = treeLines[rowIndex] ?? ""
    const fileLine = contentLines[rowIndex] ?? ""

    if (side === "left") {
      const treeCell = fitToWidth(treeLine, treeColumnWidth, true)
      const fileCell = fitToWidth(fileLine, fileColumnWidth, false)
      rows.push(`${treeCell}${separator}${fileCell}`)
    } else {
      const fileCell = fitToWidth(fileLine, fileColumnWidth, true)
      const treeCell = fitToWidth(treeLine, treeColumnWidth, false)
      rows.push(`${fileCell}${separator}${treeCell}`)
    }
  }

  return rows
}
