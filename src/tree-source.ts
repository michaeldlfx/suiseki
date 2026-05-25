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
  // `core.quotePath=false` forces raw UTF-8 paths from every git command, so
  // `ls-files` and `status` agree byte-for-byte on non-ASCII filenames. Under
  // git's default quoting, ls-files paths are used raw while status paths are
  // unquoted, so a file like `café.ts` would mismatch and lose its status.
  const subprocess = Bun.spawn(["git", "-c", "core.quotePath=false", ...args], {
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

async function runGitWithStdin(
  args: string[],
  cwd: string,
  input: string,
): Promise<GitResult> {
  const subprocess = Bun.spawn(["git", "-c", "core.quotePath=false", ...args], {
    cwd,
    stdin: Buffer.from(input),
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

// How gitignored entries appear in the tree.
export type GitignoredMode = "hidden" | "collapsed" | "expanded"

export type CollectedTree = {
  paths: string[]
  // treeRoot-relative directory paths (trailing slash) to render collapsed: the
  // gitignored dirs in "collapsed" mode. Empty for hidden/expanded.
  collapsedDirectories: Set<string>
}

type CollectTreePathsParams = {
  gitignored: GitignoredMode
  repoContext: RepoContext | null
  showHidden: boolean
  treeRoot: string
}

export async function collectTreePaths({
  gitignored,
  repoContext,
  showHidden,
  treeRoot,
}: CollectTreePathsParams): Promise<CollectedTree> {
  // Outside a repo, or when the requested root is itself gitignored (you pointed
  // at it, e.g. `sat node_modules/`), there is no gitignore filter to apply —
  // show the directory's real contents.
  if (repoContext == null || (await isTreeRootIgnored(repoContext))) {
    const paths = await walkFilesystem(treeRoot, showHidden)
    return { paths, collapsedDirectories: new Set() }
  }

  const tracked = await runGit(
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    repoContext.repoRoot,
  )
  const nonIgnored = tracked.ok
    ? reconcileToTreeRoot(splitLines(tracked.stdout), repoContext)
    : []

  if (gitignored === "hidden") {
    return {
      paths: filterHidden(nonIgnored, showHidden),
      collapsedDirectories: new Set(),
    }
  }

  if (gitignored === "expanded") {
    const everything = await runGit(
      ["ls-files", "--cached", "--others"],
      repoContext.repoRoot,
    )
    const paths = everything.ok
      ? reconcileToTreeRoot(splitLines(everything.stdout), repoContext)
      : nonIgnored
    return {
      paths: filterHidden(paths, showHidden),
      collapsedDirectories: new Set(),
    }
  }

  // collapsed: include ignored entries, but `--directory` collapses a fully
  // ignored dir to a single `node_modules/` marker (trailing slash) instead of
  // its contents. Those markers render collapsed; ignored files show as leaves.
  const ignored = await runGit(
    ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"],
    repoContext.repoRoot,
  )
  const ignoredPaths = ignored.ok
    ? reconcileToTreeRoot(splitLines(ignored.stdout), repoContext)
    : []
  const collapsedDirectories = new Set(
    ignoredPaths.filter((path) => path.endsWith("/")),
  )
  return {
    paths: filterHidden([...nonIgnored, ...ignoredPaths], showHidden),
    collapsedDirectories,
  }
}

// Whether the tree root is itself a gitignored path (so the gitignore filter
// should not apply — the user navigated into it explicitly).
async function isTreeRootIgnored(repoContext: RepoContext): Promise<boolean> {
  if (repoContext.subPrefix === "") {
    return false
  }
  const relativePath = repoContext.subPrefix.replace(/\/$/, "")
  const result = await runGit(
    ["check-ignore", relativePath],
    repoContext.repoRoot,
  )
  return result.ok
}

// Drops paths with a dot-prefixed segment when hidden files are not shown.
function filterHidden(paths: string[], showHidden: boolean): string[] {
  if (showHidden) {
    return paths
  }
  return paths.filter(
    (path) => !path.split("/").some((segment) => segment.startsWith(".")),
  )
}

type CollectRevealPathsParams = {
  gitignored: GitignoredMode
  highlightPath: string
  repoContext: RepoContext | null
  showHidden: boolean
  treeRoot: string
}

// Collects only what the collapsed `--with-tree` sidebar needs to reveal
// `highlightPath`: the direct children of each directory from the tree root down
// to the file's parent. Files come back as paths, directories as markers
// (trailing slash) so collapsed siblings render without walking into them. This
// is O(path depth), not O(repo) like collectTreePaths, since the sidebar expands
// only the one path to the viewed file. The viewed file is always included (even
// when gitignored) so it appears highlighted in its own sidebar.
export async function collectRevealPaths({
  gitignored,
  highlightPath,
  repoContext,
  showHidden,
  treeRoot,
}: CollectRevealPathsParams): Promise<string[]> {
  const directoriesToList = ["", ...getAncestorDirectoryPaths(highlightPath)]

  const candidates: { isDirectory: boolean; relativePath: string }[] = []
  for (const directory of directoriesToList) {
    const dirents = await readdir(resolve(treeRoot, directory), {
      withFileTypes: true,
    })
    for (const entry of dirents) {
      if (entry.name === ".git") {
        continue
      }
      if (!showHidden && entry.name.startsWith(".")) {
        continue
      }
      const isDirectory = entry.isDirectory()
      if (!isDirectory && !entry.isFile() && !entry.isSymbolicLink()) {
        continue
      }
      candidates.push({
        isDirectory,
        relativePath: `${directory}${entry.name}`,
      })
    }
  }

  // Only "hidden" mode drops gitignored entries. In collapsed/expanded they stay,
  // and the sidebar renders off-path dirs collapsed regardless, so an ignored
  // sibling shows as a single collapsed marker either way.
  const ignored =
    gitignored !== "hidden" || repoContext == null
      ? new Set<string>()
      : await findIgnoredPaths(
          candidates.map((candidate) => candidate.relativePath),
          repoContext,
        )

  const entries = new Set<string>([highlightPath])
  for (const candidate of candidates) {
    if (ignored.has(candidate.relativePath)) {
      continue
    }
    entries.add(
      candidate.isDirectory
        ? `${candidate.relativePath}/`
        : candidate.relativePath,
    )
  }
  return [...entries]
}

// The subset of treeRoot-relative paths that git ignores (and does not track).
// One `git check-ignore --stdin` call; it consults the index, so a tracked file
// matching an ignore rule is correctly not reported as ignored.
async function findIgnoredPaths(
  relativePaths: string[],
  repoContext: RepoContext,
): Promise<Set<string>> {
  if (relativePaths.length === 0) {
    return new Set()
  }
  const toRepoRelative = (path: string): string =>
    `${repoContext.subPrefix}${path}`
  const checkIgnore = await runGitWithStdin(
    ["check-ignore", "--stdin"],
    repoContext.repoRoot,
    relativePaths.map(toRepoRelative).join("\n"),
  )
  const ignoredRepoRelative = new Set(splitLines(checkIgnore.stdout))

  const ignored = new Set<string>()
  for (const path of relativePaths) {
    if (ignoredRepoRelative.has(toRepoRelative(path))) {
      ignored.add(path)
    }
  }
  return ignored
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
  showHidden: boolean,
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
      if (!showHidden && entry.name.startsWith(".")) {
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
