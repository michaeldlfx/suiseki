import { readdir } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import type { GitFileStatus, GitStatusState } from "./render/tree"
import { getAncestorDirectoryPaths } from "./vendor/pierre/path-helpers"

// Where the requested tree root sits relative to its enclosing git repository.
// `subPrefix` is the repo-root-relative path of the tree root, with a trailing
// slash (or "" when the tree root is the repo root). Both `git ls-files` and
// `git status` are run from the repo root so their paths share one base, then
// reconciled back to the tree root through `subPrefix`.
export type RepoContext = {
  repoRoot: string
  subPrefix: string
}

type GitResult = {
  ok: boolean
  stdout: string
}

async function runGit(args: string[], cwd: string): Promise<GitResult> {
  const subprocess = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "ignore",
  })
  const [stdout, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    subprocess.exited,
  ])
  return { ok: exitCode === 0, stdout }
}

export async function resolveRepoContext(
  treeRoot: string,
): Promise<RepoContext | null> {
  const topLevel = await runGit(["rev-parse", "--show-toplevel"], treeRoot)
  if (!topLevel.ok) {
    return null
  }

  const repoRoot = topLevel.stdout.trim()
  if (repoRoot === "") {
    return null
  }

  const relativeToRoot = relative(repoRoot, resolve(treeRoot))
  const subPrefix =
    relativeToRoot === "" ? "" : `${relativeToRoot.replaceAll("\\", "/")}/`
  return { repoRoot, subPrefix }
}

type CollectTreePathsParams = {
  all: boolean
  repoContext: RepoContext | null
  treeRoot: string
}

export async function collectTreePaths({
  all,
  repoContext,
  treeRoot,
}: CollectTreePathsParams): Promise<string[]> {
  if (repoContext != null) {
    const lsFilesArguments = ["ls-files", "--cached", "--others"]
    if (!all) {
      lsFilesArguments.push("--exclude-standard")
    }
    const lsFiles = await runGit(lsFilesArguments, repoContext.repoRoot)
    if (lsFiles.ok) {
      return reconcileToTreeRoot(splitLines(lsFiles.stdout), repoContext)
    }
  }

  return walkFilesystem(treeRoot, all)
}

type LoadGitStatusParams = {
  includeIgnored: boolean
  repoContext: RepoContext | null
}

export async function loadGitStatus({
  includeIgnored,
  repoContext,
}: LoadGitStatusParams): Promise<GitStatusState | null> {
  if (repoContext == null) {
    return null
  }

  const statusArguments = ["status", "--porcelain"]
  if (includeIgnored) {
    statusArguments.push("--ignored")
  }
  const status = await runGit(statusArguments, repoContext.repoRoot)
  if (!status.ok) {
    return null
  }

  const statusByPath = new Map<string, GitFileStatus>()
  const directoriesWithChanges = new Set<string>()

  for (const line of splitLines(status.stdout)) {
    const parsed = parsePorcelainLine(line)
    if (parsed == null) {
      continue
    }
    const treeRootRelativePath = stripSubPrefix(parsed.path, repoContext)
    if (treeRootRelativePath == null) {
      continue
    }

    statusByPath.set(treeRootRelativePath, parsed.status)
    for (const ancestor of getAncestorDirectoryPaths(treeRootRelativePath)) {
      directoriesWithChanges.add(ancestor)
    }
  }

  if (statusByPath.size === 0) {
    return null
  }

  return { directoriesWithChanges, statusByPath }
}

function reconcileToTreeRoot(
  paths: string[],
  repoContext: RepoContext,
): string[] {
  const treeRootRelativePaths = new Set<string>()
  for (const path of paths) {
    const treeRootRelativePath = stripSubPrefix(path, repoContext)
    if (treeRootRelativePath != null) {
      treeRootRelativePaths.add(treeRootRelativePath)
    }
  }
  return [...treeRootRelativePaths]
}

function stripSubPrefix(
  repoRootRelativePath: string,
  repoContext: RepoContext,
): string | null {
  if (repoContext.subPrefix === "") {
    return repoRootRelativePath
  }
  if (!repoRootRelativePath.startsWith(repoContext.subPrefix)) {
    return null
  }
  return repoRootRelativePath.slice(repoContext.subPrefix.length)
}

type ParsedPorcelainLine = {
  path: string
  status: GitFileStatus
}

function parsePorcelainLine(line: string): ParsedPorcelainLine | null {
  if (line.length < 4) {
    return null
  }

  const indicator = line.slice(0, 2)
  let pathPart = line.slice(3)
  // Renames and copies render as "orig -> new"; the new path is what exists in
  // the working tree, so that is what the tree shows.
  const arrowIndex = pathPart.indexOf(" -> ")
  if (arrowIndex !== -1) {
    pathPart = pathPart.slice(arrowIndex + 4)
  }

  return {
    path: unquoteGitPath(pathPart),
    status: mapPorcelainStatus(indicator),
  }
}

function mapPorcelainStatus(indicator: string): GitFileStatus {
  if (indicator === "??") {
    return "untracked"
  }
  if (indicator === "!!") {
    return "ignored"
  }

  const indexStatus = indicator.charAt(0)
  const workTreeStatus = indicator.charAt(1)
  const code = workTreeStatus !== " " ? workTreeStatus : indexStatus

  switch (code) {
    case "A":
      return "added"
    case "D":
      return "deleted"
    case "R":
      return "renamed"
    case "C":
      // Copies only appear with copy detection enabled (off by default). Treat a
      // copied file as a new file rather than carrying a separate state.
      return "added"
    default:
      return "modified"
  }
}

// Git quotes paths containing unusual bytes with C-style escapes when
// core.quotePath is on. The escaping overlaps JSON for the common cases, so
// reuse JSON.parse and fall back to the raw text if it does not apply.
function unquoteGitPath(pathPart: string): string {
  if (!pathPart.startsWith('"') || !pathPart.endsWith('"')) {
    return pathPart
  }
  try {
    return JSON.parse(pathPart) as string
  } catch {
    return pathPart
  }
}

async function walkFilesystem(
  treeRoot: string,
  all: boolean,
): Promise<string[]> {
  const paths: string[] = []

  async function walk(
    directory: string,
    relativePrefix: string,
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === ".git") {
        continue
      }
      if (!all && entry.name.startsWith(".")) {
        continue
      }

      const entryRelativePath = `${relativePrefix}${entry.name}`
      if (entry.isDirectory()) {
        await walk(join(directory, entry.name), `${entryRelativePath}/`)
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        paths.push(entryRelativePath)
      }
    }
  }

  await walk(resolve(treeRoot), "")
  return paths
}

function splitLines(output: string): string[] {
  return output.split("\n").filter((line) => line !== "")
}
