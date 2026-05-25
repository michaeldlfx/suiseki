import { emitStyledText, fitToWidth, visibleWidth } from "../ansi"
import type { SuisekiConfig } from "../config"
import { buildFileView } from "./file"
import { prepareRenderContext } from "./highlight"
import { buildTree, type GitStatusState, renderTreeLines } from "./tree"

// Below this terminal width the side-by-side layout is too cramped; callers fall
// back to the plain file view.
export const MIN_WIDTH_FOR_TREE = 100
const TREE_COLUMN_MAX_WIDTH = 40
const SEPARATOR = " │ "

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
}

// Side-by-side layout: the surrounding directory tree on the left (current file
// highlighted), the file's contents on the right. The tree column is fixed
// width; the file column takes the rest and is truncated so long lines never
// wrap into the tree column.
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

  const treeColumnWidth = Math.min(
    treeLines.reduce((widest, line) => Math.max(widest, visibleWidth(line)), 0),
    TREE_COLUMN_MAX_WIDTH,
  )
  const fileColumnWidth = Math.max(
    context.terminalWidth - treeColumnWidth - SEPARATOR.length,
    1,
  )
  const separator = emitStyledText({
    text: SEPARATOR,
    foregroundColor: context.palette.separatorForeground,
  })
  const rowCount = Math.max(treeLines.length, contentLines.length)
  const rows: string[] = []

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const treeCell = fitToWidth(
      treeLines[rowIndex] ?? "",
      treeColumnWidth,
      true,
    )
    const fileLine = contentLines[rowIndex]
    const fileCell =
      fileLine == null ? "" : fitToWidth(fileLine, fileColumnWidth, false)
    rows.push(`${treeCell}${separator}${fileCell}`)
  }

  return rows
}
