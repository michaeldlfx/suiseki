// SPDX-License-Identifier: Apache-2.0
// Derived from @pierre/trees:
// https://github.com/pierrecomputer/pierre/blob/5ca34b1b809ac6f8bb13bb431e68dae1246522f4/packages/trees/src/model/pathHelpers.ts
// Modifications: kept only getAncestorDirectoryPaths, used to roll a file's
// git status up to its ancestor directories in the static tree print.

// Returns the canonical ancestor directory paths of a path, each with a
// trailing slash. For "src/render/diff.ts" → ["src/", "src/render/"].
export function getAncestorDirectoryPaths(path: string): readonly string[] {
  const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path
  if (normalizedPath.length === 0) {
    return []
  }

  const segments = normalizedPath.split("/")
  return segments
    .slice(0, -1)
    .map((_, index) => `${segments.slice(0, index + 1).join("/")}/`)
}
