// Classifies what `suiseki view` / `sat` should render for a given argument.
// Kept separate from cli.ts (which runs main() on import) so the decision logic
// stays unit-testable. The filesystem stat happens in the caller; this is pure.

export type ViewTarget = "file" | "missing" | "stdin" | "tree"

type ClassifyViewTargetParams = {
  exists: boolean
  isDirectory: boolean
  isStdinTty: boolean
  pathArgument: string | undefined
}

// `view`/`sat` is polymorphic: a file shows content, a directory shows its tree.
//   - "-" always reads stdin
//   - no path: tree the current directory on a TTY, otherwise read piped stdin
//   - an existing directory trees, an existing file views, anything else is missing
export function classifyViewTarget({
  exists,
  isDirectory,
  isStdinTty,
  pathArgument,
}: ClassifyViewTargetParams): ViewTarget {
  if (pathArgument === "-") {
    return "stdin"
  }
  if (pathArgument == null) {
    return isStdinTty ? "tree" : "stdin"
  }
  if (!exists) {
    return "missing"
  }
  return isDirectory ? "tree" : "file"
}
