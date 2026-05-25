import { stat } from "node:fs/promises"
import { basename, dirname, relative, resolve } from "node:path"
import { createInterface } from "node:readline"
import { type } from "arktype"
import { stripAnsi } from "./ansi"
import { parseCliOptions } from "./cli-options"
import { vStringBoolean } from "./common/validators"
import {
  type GitignoredMode,
  loadConfig,
  readSuisekiEnv,
  type SuisekiConfig,
  vGitignoredMode,
  vTreeSide,
} from "./config"
import { runConfigCommand } from "./config-command"
import { getDefaultConfigPath, runInitCommandWithIO } from "./init-command"
import { renderColorOnly } from "./render/color-only"
import { renderDiff, streamDiffBlocks } from "./render/diff"
import { renderFileView, streamFileViewLines } from "./render/file"
import { getTerminalWidth, prepareRenderContext } from "./render/highlight"
import {
  containsMergeConflictMarkers,
  renderMergeConflictFile,
} from "./render/merge-conflict"
import { buildTree, renderTreeLines } from "./render/tree"
import { MIN_WIDTH_FOR_TREE, renderWithTreeLines } from "./render/with-tree"
import { runThemesCommand } from "./themes-command"
import {
  collectRevealPaths,
  collectTreePaths,
  loadGitStatus,
  type RepoContext,
  resolveRepoContext,
} from "./tree-source"
import { runUpgradeCommand } from "./upgrade-io"
import { getAncestorDirectoryPaths } from "./vendor/pierre/path-helpers"
import { version } from "./version"
import { classifyViewTarget } from "./view-target"

class CliError extends Error {
  override name = "CliError"

  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message)
  }
}

async function main(): Promise<void> {
  // Invoked through the `sat` symlink (busybox-style): the binary becomes the
  // file/tree viewer, i.e. exactly `suiseki view`. `process.argv0` preserves the
  // invocation name even though a compiled Bun binary resolves the symlink for
  // argv[0]/execPath.
  if (basename(process.argv0) === "sat") {
    await runViewCommand(process.argv.slice(2))
    return
  }

  if (process.argv[2] === "themes") {
    await runThemesCommand()
    return
  }

  if (process.argv[2] === "upgrade") {
    await runUpgradeCommand()
    return
  }

  if (process.argv[2] === "config") {
    const configArgument = process.argv[3]
    if (configArgument === "--init") {
      await runInitCommandWithIO({
        targetPath: getDefaultConfigPath(),
        io: { promptOverwrite: interactiveOverwritePrompt },
      })
    } else if (configArgument === undefined) {
      await runConfigCommand()
    } else {
      throw new CliError(
        `Unknown argument for 'config': ${configArgument}. Did you mean 'config --init'?`,
      )
    }
    return
  }

  if (process.argv[2] === "view") {
    await runViewCommand(process.argv.slice(3))
    return
  }

  const parsedOptions = parseCliOptions(process.argv.slice(2))
  if (parsedOptions.version) {
    process.stdout.write(`suiseki ${version}\n`)
    return
  }
  if (parsedOptions.help) {
    process.stdout.write(`${getHelpText()}\n`)
    return
  }

  const emptyDirectInvocation =
    process.stdin.isTTY === true && parsedOptions.gitArguments.length === 0
  if (emptyDirectInvocation) {
    process.stdout.write(`${getHelpText()}\n`)
    return
  }

  const suisekiEnv = readSuisekiEnv()
  const noPager = parsedOptions.noPager || suisekiEnv.SUISEKI_NO_PAGER === true
  const configuration = await loadConfig({
    overrides: parsedOptions.overrides,
    suisekiEnv,
  })
  const patch = await readPatchInput(parsedOptions.gitArguments)

  if (patch.trim() === "") {
    return
  }

  const noColor = parsedOptions.noColor || (Bun.env.NO_COLOR ?? "") !== ""

  // The line-preserving colorizer for `interactive.diffFilter` runs before the
  // pager and merge-conflict paths: those reshape the diff, which would break
  // the line-for-line mapping the interactive UI depends on. It is a pure
  // filter, so it always writes straight to stdout (no pager).
  if (parsedOptions.colorOnly) {
    const renderedColorOnly = await renderColorOnly(patch, configuration)
    await writeToStdout(
      noColor ? stripAnsi(renderedColorOnly) : renderedColorOnly,
    )
    return
  }

  const usePager = !noPager && process.stdout.isTTY === true
  const isMergeConflict = containsMergeConflictMarkers(patch)

  // The pager and merge-conflict renderer both need the full string up front,
  // so buffer those. The plain stdout path streams per file: it keeps peak
  // memory down and shows the first file without waiting for the whole render.
  if (usePager || isMergeConflict) {
    const renderedDiff = isMergeConflict
      ? await renderMergeConflictFile({ configuration, content: patch })
      : await renderDiff(patch, configuration)
    if (renderedDiff === "") {
      return
    }
    const output = `${noColor ? stripAnsi(renderedDiff) : renderedDiff}\n`
    if (usePager) {
      await writeWithPager(output)
    } else {
      await writeToStdout(output)
    }
    return
  }

  await streamBlocksToStdout(streamDiffBlocks(patch, configuration), noColor)
}

// Writes rendered blocks to stdout one at a time, joining them with "\n" and
// applying backpressure between blocks so a slow or short-lived consumer can't
// force us to buffer the whole render. Stops early (without error) when the
// consumer closes the pipe — a clean exit for a Unix filter like `... | head`.
async function streamBlocksToStdout(
  blocks: AsyncIterable<string>,
  noColor: boolean,
): Promise<void> {
  let wroteAnyBlock = false
  for await (const block of blocks) {
    const renderedBlock = noColor ? stripAnsi(block) : block
    const pipeOpen = await writeToStdout(
      wroteAnyBlock ? `\n${renderedBlock}` : renderedBlock,
    )
    if (!pipeOpen) {
      return
    }
    wroteAnyBlock = true
  }
  if (wroteAnyBlock) {
    await writeToStdout("\n")
  }
}

type ViewInput =
  | { kind: "text"; content: string; fileName: string }
  | { kind: "binary"; fileName: string }

// The single entry point behind `suiseki view` and the `sat` symlink. It is
// polymorphic: a file path shows content, a directory path shows its tree, and
// stdin is read when piped or for "-".
async function runViewCommand(viewArguments: string[]): Promise<void> {
  const {
    gitignored,
    gitStatus,
    icons,
    rest,
    showHidden,
    withTree,
    withTreeSide,
  } = extractViewFlags(viewArguments)
  const parsedOptions = parseCliOptions(rest)
  if (parsedOptions.version) {
    process.stdout.write(`suiseki ${version}\n`)
    return
  }
  if (parsedOptions.help) {
    process.stdout.write(`${getViewHelpText()}\n`)
    return
  }

  const suisekiEnv = readSuisekiEnv()
  const noPager = parsedOptions.noPager || suisekiEnv.SUISEKI_NO_PAGER === true
  const noColor = parsedOptions.noColor || (Bun.env.NO_COLOR ?? "") !== ""
  const configuration = await loadConfig({
    overrides: parsedOptions.overrides,
    suisekiEnv,
  })
  // Per-flag overrides (`--gitignored=`, `--hidden`/`--no-hidden`) win, otherwise
  // the `[view]` config defaults decide.
  const resolvedGitignored = gitignored ?? configuration.view.gitignored
  const resolvedShowHidden = showHidden ?? configuration.view.hidden
  const resolvedTreeSide = withTreeSide ?? configuration.view["with-tree-side"]

  // `view`/`sat` takes a single path (or none, for stdin/cwd). Reject extra
  // paths loudly rather than silently viewing only the first.
  if (parsedOptions.gitArguments.length > 1) {
    throw new CliError(
      `view accepts a single path, but got ${parsedOptions.gitArguments.length}: ${parsedOptions.gitArguments.join(", ")}`,
    )
  }

  const pathArgument = parsedOptions.gitArguments[0]
  const target = await classifyViewTargetFromPath(pathArgument)

  if (target === "missing") {
    throw new CliError(`No such file or directory: ${pathArgument}`)
  }

  if (target === "tree") {
    await emitTree({
      configuration,
      gitignored: resolvedGitignored,
      gitStatus,
      icons,
      noColor,
      noPager,
      showHidden: resolvedShowHidden,
      treeRoot: pathArgument ?? ".",
    })
    return
  }

  const input = await readFileInput({ pathArgument, target })
  if (input.kind === "binary") {
    const source = input.fileName === "" ? "stdin" : input.fileName
    process.stderr.write(`${source}: binary file — not shown\n`)
    return
  }

  // `--with-tree` (or `[view].with-tree`) shows the file beside its directory
  // tree. It needs a real file path to locate and highlight, an interactive
  // terminal, and enough width. When stdout is piped or redirected we stay a
  // clean full-width file view: the sidebar truncates lines to columns, which
  // would mangle output for any downstream consumer (the Unix-filter contract).
  const withTreeEnabled = withTree ?? configuration.view["with-tree"]
  if (
    withTreeEnabled &&
    input.fileName !== "" &&
    process.stdout.isTTY === true &&
    getTerminalWidth() >= MIN_WIDTH_FOR_TREE
  ) {
    await emitFileWithTree({
      configuration,
      gitignored: resolvedGitignored,
      gitStatus,
      icons,
      input,
      noColor,
      noPager,
      showHidden: resolvedShowHidden,
      treeSide: resolvedTreeSide,
    })
    return
  }

  await emitFileView({ configuration, input, noColor, noPager })
}

type EmitFileWithTreeParams = {
  configuration: SuisekiConfig
  gitignored: GitignoredMode
  gitStatus: boolean
  icons: boolean
  input: { content: string; fileName: string }
  noColor: boolean
  noPager: boolean
  showHidden: boolean
  treeSide: "left" | "right"
}

async function emitFileWithTree({
  configuration,
  gitignored,
  gitStatus,
  icons,
  input,
  noColor,
  noPager,
  showHidden,
  treeSide,
}: EmitFileWithTreeParams): Promise<void> {
  // Root the sidebar at the project (repo root, or cwd outside a repo) and
  // reveal just the path to the file: expand its ancestor directories, collapse
  // the rest. A repo-root sidebar context always has an empty subPrefix.
  const fileAbsolute = resolve(input.fileName)
  const fileDirectory = dirname(fileAbsolute)
  const fileDirContext = await resolveRepoContext(fileDirectory)
  let sidebarRoot = fileDirContext?.repoRoot ?? process.cwd()
  let sidebarContext: RepoContext | null =
    fileDirContext == null
      ? null
      : { repoRoot: fileDirContext.repoRoot, subPrefix: "" }
  let highlightPath = relative(sidebarRoot, fileAbsolute)

  // The file sits outside the project root (e.g. an absolute path elsewhere):
  // root the sidebar at the file's own directory so it still appears.
  if (highlightPath.startsWith("..")) {
    sidebarRoot = fileDirectory
    sidebarContext = fileDirContext
    highlightPath = basename(fileAbsolute)
  }
  const rootLabel = basename(sidebarRoot) || sidebarRoot

  // The sidebar expands only the one path to the viewed file, so collect just
  // the direct children of each directory along that path; collapsed siblings
  // need only their names. O(path depth), not a full-repo walk. The viewed file
  // is always included (even when gitignored) so it shows in its own sidebar.
  const paths = await collectRevealPaths({
    gitignored,
    highlightPath,
    repoContext: sidebarContext,
    showHidden,
    treeRoot: sidebarRoot,
  })
  const gitStatusState = gitStatus
    ? await loadGitStatus({
        includeIgnored: gitignored !== "hidden",
        repoContext: sidebarContext,
      })
    : null
  const lines = await renderWithTreeLines({
    configuration,
    content: input.content,
    expandedDirectories: new Set(getAncestorDirectoryPaths(highlightPath)),
    fileName: input.fileName,
    gitStatus: gitStatusState,
    highlightPath,
    paths,
    rootLabel,
    showIcons: icons,
    side: treeSide,
  })

  await emitLines({ lines, noColor, noPager })
}

async function classifyViewTargetFromPath(
  pathArgument: string | undefined,
): Promise<ReturnType<typeof classifyViewTarget>> {
  const stats =
    pathArgument != null && pathArgument !== "-"
      ? await stat(pathArgument).catch(() => null)
      : null
  return classifyViewTarget({
    exists: stats != null,
    isDirectory: stats?.isDirectory() === true,
    isStdinTty: process.stdin.isTTY === true,
    pathArgument,
  })
}

type EmitFileViewParams = {
  configuration: SuisekiConfig
  input: { content: string; fileName: string }
  noColor: boolean
  noPager: boolean
}

async function emitFileView({
  configuration,
  input,
  noColor,
  noPager,
}: EmitFileViewParams): Promise<void> {
  const usePager = !noPager && process.stdout.isTTY === true

  // The pager needs the whole render up front; the plain stdout path streams
  // per line so `sat huge.log | head` can stop early, skipping tokenization of
  // the lines it never reads (the dominant cost). The file itself is already in
  // memory by this point, so this saves render time, not peak memory.
  if (usePager) {
    const rendered = await renderFileView({
      configuration,
      content: input.content,
      fileName: input.fileName,
    })
    if (rendered === "") {
      return
    }
    await writeWithPager(`${noColor ? stripAnsi(rendered) : rendered}\n`)
    return
  }

  await streamBlocksToStdout(
    streamFileViewLines({
      configuration,
      content: input.content,
      fileName: input.fileName,
    }),
    noColor,
  )
}

type ReadFileInputParams = {
  pathArgument: string | undefined
  target: "file" | "stdin"
}

async function readFileInput({
  pathArgument,
  target,
}: ReadFileInputParams): Promise<ViewInput> {
  // Both branches read all bytes up front (the file is materialized in memory),
  // then NUL-sniff for binary so `cat image.png | sat` and `sat image.bin` both
  // refuse rather than dumping raw bytes into the terminal. The streaming in
  // streamFileViewLines saves per-line tokenization on early exit, not memory.
  if (target === "stdin") {
    const bytes = await Bun.stdin.bytes()
    if (isBinaryContent(bytes)) {
      return { kind: "binary", fileName: "" }
    }
    return {
      kind: "text",
      content: new TextDecoder().decode(bytes),
      fileName: "",
    }
  }

  const filePath = pathArgument as string
  const bytes = await Bun.file(filePath).bytes()
  if (isBinaryContent(bytes)) {
    return { kind: "binary", fileName: filePath }
  }

  return {
    kind: "text",
    content: new TextDecoder().decode(bytes),
    fileName: filePath,
  }
}

// A NUL byte in the leading bytes is the same heuristic git and bat use to
// classify a file as binary. Sampling the head keeps this cheap on large files.
function isBinaryContent(bytes: Uint8Array): boolean {
  const sampleLength = Math.min(bytes.length, 8000)
  for (let index = 0; index < sampleLength; index++) {
    if (bytes[index] === 0) {
      return true
    }
  }
  return false
}

type ViewFlags = {
  // undefined when not given, so `[view].gitignored` decides (`--gitignored=<mode>`).
  gitignored: GitignoredMode | undefined
  gitStatus: boolean
  icons: boolean
  rest: string[]
  // undefined when not given, so `[view].hidden` decides (`--hidden`/`--no-hidden`).
  showHidden: boolean | undefined
  // undefined when neither --with-tree nor --with-tree=<bool> was given, so the
  // config default ([view].with-tree) decides.
  withTree: boolean | undefined
  // undefined when --with-tree-side=<side> was not given, so the config default
  // ([view].with-tree-side) decides.
  withTreeSide: "left" | "right" | undefined
}

function extractViewFlags(viewArguments: string[]): ViewFlags {
  let gitignored: GitignoredMode | undefined
  let gitStatus = true
  let icons = true
  let showHidden: boolean | undefined
  let withTree: boolean | undefined
  let withTreeSide: "left" | "right" | undefined
  const rest: string[] = []

  for (const argument of viewArguments) {
    if (argument.startsWith("--gitignored=")) {
      gitignored = parseGitignoredMode(argument.slice("--gitignored=".length))
    } else if (argument === "--hidden") {
      showHidden = true
    } else if (argument === "--no-hidden") {
      showHidden = false
    } else if (argument === "--git-status") {
      gitStatus = true
    } else if (argument === "--no-git-status") {
      gitStatus = false
    } else if (argument === "--icons") {
      icons = true
    } else if (argument === "--no-icons") {
      icons = false
    } else if (argument === "--with-tree" || argument === "-t") {
      withTree = true
    } else if (argument.startsWith("--with-tree-side=")) {
      withTreeSide = parseTreeSide(argument.slice("--with-tree-side=".length))
    } else if (argument.startsWith("--with-tree=")) {
      withTree = parseBooleanFlagValue(
        "--with-tree",
        argument.slice("--with-tree=".length),
      )
    } else {
      rest.push(argument)
    }
  }

  return {
    gitignored,
    gitStatus,
    icons,
    rest,
    showHidden,
    withTree,
    withTreeSide,
  }
}

// Flag values are validated against the same Arktype schemas the config and env
// use, so the valid sets live in one place. We surface a friendly CLI message
// rather than Arktype's default on failure.
function parseBooleanFlagValue(flag: string, rawValue: string): boolean {
  const result = vStringBoolean(rawValue)
  if (result instanceof type.errors) {
    throw new CliError(`${flag} must be true or false`)
  }
  return result
}

function parseGitignoredMode(rawValue: string): GitignoredMode {
  const result = vGitignoredMode(rawValue)
  if (result instanceof type.errors) {
    throw new CliError("--gitignored must be hidden, collapsed, or expanded")
  }
  return result
}

function parseTreeSide(rawValue: string): "left" | "right" {
  const result = vTreeSide(rawValue)
  if (result instanceof type.errors) {
    throw new CliError("--with-tree-side must be left or right")
  }
  return result
}

type EmitTreeParams = {
  configuration: SuisekiConfig
  gitignored: GitignoredMode
  gitStatus: boolean
  icons: boolean
  noColor: boolean
  noPager: boolean
  showHidden: boolean
  treeRoot: string
}

async function emitTree({
  configuration,
  gitignored,
  gitStatus,
  icons,
  noColor,
  noPager,
  showHidden,
  treeRoot,
}: EmitTreeParams): Promise<void> {
  const repoContext = await resolveRepoContext(treeRoot)
  const { paths, collapsedDirectories } = await collectTreePaths({
    gitignored,
    repoContext,
    showHidden,
    treeRoot,
  })
  const gitStatusState = gitStatus
    ? await loadGitStatus({
        includeIgnored: gitignored !== "hidden",
        repoContext,
      })
    : null
  const context = await prepareRenderContext(configuration)
  const lines = renderTreeLines({
    collapsedDirectories,
    gitStatus: gitStatusState,
    palette: context.palette,
    root: buildTree(paths),
    rootLabel: treeRoot,
    showIcons: icons,
  })

  await emitLines({ lines, noColor, noPager })
}

type EmitLinesParams = {
  lines: string[]
  noColor: boolean
  noPager: boolean
}

async function emitLines({
  lines,
  noColor,
  noPager,
}: EmitLinesParams): Promise<void> {
  const usePager = !noPager && process.stdout.isTTY === true

  if (usePager) {
    if (lines.length === 0) {
      return
    }
    const output = `${lines.join("\n")}\n`
    await writeWithPager(noColor ? stripAnsi(output) : output)
    return
  }

  await streamBlocksToStdout(iterateLines(lines), noColor)
}

async function* iterateLines(lines: string[]): AsyncGenerator<string> {
  for (const line of lines) {
    yield line
  }
}

// Resolves true once the chunk is flushed (or queued), giving us backpressure
// between file blocks so a slow consumer can't make us buffer the whole diff.
// Resolves false when the consumer closed the pipe (EPIPE) — a clean stop for a
// Unix filter like `suiseki | head`, not an error.
function writeToStdout(chunk: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    process.stdout.write(chunk, (error) => {
      if (error == null) {
        resolve(true)
      } else if ((error as NodeJS.ErrnoException).code === "EPIPE") {
        resolve(false)
      } else {
        reject(error)
      }
    })
  })
}

async function interactiveOverwritePrompt(
  targetPath: string,
): Promise<boolean> {
  if (process.stdin.isTTY !== true) {
    process.stderr.write(
      `Config file already exists at ${targetPath}. Skipping (stdin is not a TTY).\n`,
    )
    return false
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(
      `Config file already exists at ${targetPath}. Overwrite? [y/N]: `,
      (answer) => {
        rl.close()
        resolve(answer.trim().toLowerCase() === "y")
      },
    )
  })
}

function getHelpText(): string {
  return [
    "suiseki - terminal diff renderer",
    "",
    "Usage:",
    "  git diff | suiseki",
    "  suiseki [options] [git-diff-args...]",
    "  suiseki view <file|dir>     Highlight a file, or tree a directory",
    "  sat <file|dir>              Symlink for view (cat/bat/tree alternative)",
    "  suiseki themes              List available themes",
    "  suiseki config              Print full config reference as annotated TOML",
    "  suiseki config --init       Create ~/.suiseki/config.toml",
    "  suiseki upgrade             Update to the latest release",
    "",
    "Examples:",
    "  suiseki --staged",
    "  suiseki --view split --theme pierre-light HEAD~1",
    "",
    "Git setup:",
    "  git config --global pager.diff 'suiseki'",
    "  git config --global pager.show 'suiseki'",
    "  git config --global interactive.diffFilter 'suiseki --color-only'",
    "",
    "Options:",
    "  --view <unified|split>",
    "  --theme <name>",
    "  --line-numbers / --no-line-numbers",
    "  --change-indicator <sign|bar|background>",
    "  --diff-background / --no-diff-background",
    "  --file-header / --no-file-header",
    "  --hunk-header <none|full>",
    "  --word-diff <word-alt|word|char|none>",
    "  --max-line-diff-length <number>",
    "  --max-line-length <number>",
    "  --max-file-lines <number>",
    "  --no-pager",
    "  --no-color   (also honors NO_COLOR env var)",
    "  --color-only Colorize a diff line-for-line (for interactive.diffFilter)",
    "  --version    Print the suiseki version",
    "",
    "More:",
    "  Run 'suiseki config' for the full config reference.",
    "  Docs: https://github.com/michaeldlfx/suiseki#readme",
  ].join("\n")
}

function getViewHelpText(): string {
  return [
    "suiseki view - show a file's contents, or a directory's tree",
    "(also available as the `sat` symlink; a cat/bat/tree alternative)",
    "",
    "Usage:",
    "  suiseki view <file>       Syntax-highlight a file",
    "  suiseki view <dir>        Print the directory tree",
    "  suiseki view -            Read file content from stdin",
    "  cat file | suiseki view",
    "  sat <file|dir>            Same, via the sat symlink",
    "",
    "File options:",
    "  --with-tree, -t  Show the file beside its directory tree",
    "                   (--with-tree=false to override a config default)",
    "  --with-tree-side=<left|right>   Which side the tree sits on",
    "  --line-numbers / --no-line-numbers",
    "  --file-header / --no-file-header",
    "  --max-line-length <number>",
    "  --max-file-lines <number>",
    "",
    "Tree options (when the argument is a directory):",
    "  --gitignored=<hidden|collapsed|expanded>",
    "                   How gitignored dirs appear (default collapsed: shown but",
    "                   not drilled into). `sat <ignored-dir>` always shows inside.",
    "  --hidden / --no-hidden   Show or hide dotfiles (shown by default)",
    "  --no-icons       Hide directory glyphs (shown by default)",
    "  --no-git-status  Hide the git status column (on by default in a repo)",
    "",
    "Common options:",
    "  --theme <name>",
    "  --no-pager",
    "  --no-color   (also honors NO_COLOR env var)",
  ].join("\n")
}

async function writeWithPager(output: string): Promise<void> {
  try {
    const pager = Bun.spawn(
      ["less", "-R", "--no-init", "--quit-if-one-screen"],
      {
        stdin: "pipe",
        stdout: "inherit",
        stderr: "inherit",
      },
    )

    try {
      pager.stdin.write(output)
      await pager.stdin.end()
    } catch {
      // Pager exited early (e.g. user pressed q). Drop the rest silently.
    }

    await pager.exited
  } catch {
    // Pager not available (e.g. less not on PATH). Fall back to stdout.
    process.stdout.write(output)
  }
}

async function readPatchInput(argumentsFromCli: string[]): Promise<string> {
  if (process.stdin.isTTY !== true) {
    return Bun.stdin.text()
  }

  const gitDiffSubprocess = Bun.spawn(
    ["git", "diff", "--no-color", ...argumentsFromCli],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdoutText, stderrText, exitCode] = await Promise.all([
    new Response(gitDiffSubprocess.stdout).text(),
    new Response(gitDiffSubprocess.stderr).text(),
    gitDiffSubprocess.exited,
  ])

  if (exitCode !== 0) {
    throw new CliError(
      stderrText.trim() === ""
        ? `git diff exited with status ${exitCode}`
        : stderrText.trim(),
      exitCode,
    )
  }

  return stdoutText
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

try {
  await main()
} catch (error) {
  process.stderr.write(`${getErrorMessage(error)}\n`)
  process.exitCode = error instanceof CliError ? error.exitCode : 1
}
