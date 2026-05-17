import { stripAnsi } from "./ansi"
import { parseCliOptions } from "./cli-options"
import { loadConfig, parseEnvironmentBoolean } from "./config"
import { renderDiff } from "./render/diff"
import {
  containsMergeConflictMarkers,
  renderMergeConflictFile,
} from "./render/merge-conflict"
import { runThemesCommand } from "./themes-command"

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
  if (process.argv[2] === "themes") {
    await runThemesCommand()
    return
  }

  const parsedOptions = parseCliOptions(process.argv.slice(2))
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

  const noPager =
    parsedOptions.noPager ||
    (Bun.env.SUISEKI_NO_PAGER != null &&
      Bun.env.SUISEKI_NO_PAGER !== "" &&
      parseEnvironmentBoolean({
        name: "SUISEKI_NO_PAGER",
        value: Bun.env.SUISEKI_NO_PAGER,
      }))
  const configuration = await loadConfig({
    overrides: parsedOptions.overrides,
  })
  const patch = await readPatchInput(parsedOptions.gitArguments)

  if (patch.trim() === "") {
    return
  }

  const renderedDiff = containsMergeConflictMarkers(patch)
    ? await renderMergeConflictFile({ configuration, content: patch })
    : await renderDiff(patch, configuration)

  if (renderedDiff === "") {
    return
  }

  const noColor = parsedOptions.noColor || (Bun.env.NO_COLOR ?? "") !== ""
  const output = `${noColor ? stripAnsi(renderedDiff) : renderedDiff}\n`

  if (!noPager && process.stdout.isTTY === true) {
    await writeWithPager(output)
  } else {
    process.stdout.write(output)
  }
}

function getHelpText(): string {
  return [
    "suiseki - terminal diff renderer",
    "",
    "Usage:",
    "  git diff | suiseki",
    "  suiseki [options] [git-diff-args...]",
    "  suiseki themes              List available themes",
    "",
    "Examples:",
    "  suiseki --staged",
    "  suiseki --view split --theme github-light HEAD~1",
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
    "  --no-pager",
    "  --no-color   (also honors NO_COLOR env var)",
    "  --color-only",
    "",
    "More:",
    "  Config: ~/.suiseki/config.toml or .suiseki.toml (per-repo). Env vars: SUISEKI_*.",
    "  Docs:   https://github.com/michaeldlfx/suiseki#readme",
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
