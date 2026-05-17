import type { SuisekiConfig } from "../config"
import { parseMergeConflictDiffFromFile } from "../vendor/pierre/parse-merge-conflict-diff-from-file"
import { prepareDiffRenderContext, renderFileDiff } from "./diff"

const MERGE_CONFLICT_START_MARKER = /^<{7,}(?:\s.*)?$/m

export function containsMergeConflictMarkers(content: string): boolean {
  return MERGE_CONFLICT_START_MARKER.test(content)
}

type RenderMergeConflictFileParams = {
  configuration: SuisekiConfig
  content: string
  name?: string
}

export async function renderMergeConflictFile({
  configuration,
  content,
  name = "<merge conflict>",
}: RenderMergeConflictFileParams): Promise<string> {
  const parseResult = parseMergeConflictDiffFromFile({
    name,
    contents: content,
  })

  const context = await prepareDiffRenderContext(configuration)
  const fileBlock = await renderFileDiff({
    configuration,
    context,
    file: parseResult.fileDiff,
  })

  return fileBlock.join("\n")
}
