import { createInterface } from "node:readline"
import { stripAnsi } from "./ansi"
import { parseCliOptions } from "./cli-options"
import { loadConfig, readSuisekiEnv } from "./config"
import { runConfigCommand } from "./config-command"
import { getInitPathCandidates, runInitCommandWithIO } from "./init-command"
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

  if (process.argv[2] === "config") {
    await runConfigCommand()
    return
  }

  if (process.argv[2] === "init") {
    await runInitCommandWithIO(buildInteractiveInitIO())
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

function buildInteractiveInitIO() {
  return {
    async promptPathChoice(): Promise<string> {
      const [xdgPath, legacyPath] = getInitPathCandidates()
      process.stdout.write(
        [
          "Where should suiseki write the config file?",
          "",
          `  1) ${xdgPath}  (XDG, higher priority)`,
          `  2) ${legacyPath}`,
          "",
        ].join("\n"),
      )
      const answer = await promptLine("Choice [1]: ")
      const trimmed = answer.trim()
      if (trimmed === "" || trimmed === "1") return xdgPath
      if (trimmed === "2") return legacyPath
      const retry = await promptLine(
        `Invalid choice "${trimmed}". Choose 1 or 2 [1]: `,
      )
      const retrimmed = retry.trim()
      if (retrimmed === "" || retrimmed === "1") return xdgPath
      if (retrimmed === "2") return legacyPath
      throw new Error(`Invalid choice: ${retry.trim()}`)
    },
    async promptOverwrite(targetPath: string): Promise<boolean> {
      const answer = await promptLine(
        `Config file already exists at ${targetPath}. Overwrite? [y/N]: `,
      )
      return answer.trim().toLowerCase() === "y"
    },
  }
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function getHelpText(): string {
  return [
    "suiseki - terminal diff renderer",
    "",
    "Usage:",
    "  git diff | suiseki",
    "  suiseki [options] [git-diff-args...]",
    "  suiseki themes              List available themes",
    "  suiseki config              Print full config reference as annotated TOML",
    "  suiseki init                Create config file interactively",
    "",
    "Examples:",
    "  suiseki --staged",
    "  suiseki --view split --theme pierre-light HEAD~1",
    "",
    "Git setup:",
    "  git config --global pager.diff 'suiseki'",
    "  git config --global pager.show 'suiseki'",
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
    "",
    "More:",
    "  Run 'suiseki config' for the full config reference.",
    "  Docs: https://github.com/michaeldlfx/suiseki#readme",
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
