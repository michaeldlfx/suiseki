// SPDX-License-Identifier: Apache-2.0
// Derived from @pierre/trees:
// https://github.com/pierrecomputer/pierre/blob/5ca34b1b809ac6f8bb13bb431e68dae1246522f4/packages/trees/src/utils/sortChildren.ts
// Modifications: reduced to the default semantic comparator, operating on
// resolved { name, isDirectory } entries instead of paths + an isFolder
// callback, and dropped the `f::` flattened-path handling (a feature of the
// interactive web tree that suiseki's static print does not use).

export type TreeChildSortEntry = {
  isDirectory: boolean
  name: string
}

// Pierre's default file-tree sort order:
//   1. folders before files
//   2. dot-prefixed (hidden) items before others within each group
//   3. case-insensitive alphabetical within each subgroup
export function compareTreeChildren(
  a: TreeChildSortEntry,
  b: TreeChildSortEntry,
): number {
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1
  }

  const aIsDot = a.name.charCodeAt(0) === 46
  const bIsDot = b.name.charCodeAt(0) === 46
  if (aIsDot !== bIsDot) {
    return aIsDot ? -1 : 1
  }

  return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}
