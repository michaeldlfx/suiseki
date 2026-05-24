import { createInterface } from "node:readline"
import { stripAnsi } from "./ansi"
import { parseCliOptions } from "./cli-options"
import { loadConfig, readSuisekiEnv } from "./config"
import { runConfigCommand } from "./config-command"
import { getDefaultConfigPath, runInitCommandWithIO } from "./init-command"
import { renderDiff, streamDiffBlocks } from "./render/diff"
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

  const noColor = parsedOptions.noColor || (Bun.env.NO_COLOR ?? "") !== ""
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

  let wroteAnyBlock = false
  for await (const block of streamDiffBlocks(patch, configuration)) {
    const renderedBlock = noColor ? stripAnsi(block) : block
    await writeToStdout(wroteAnyBlock ? `\n${renderedBlock}` : renderedBlock)
    wroteAnyBlock = true
  }
  if (wroteAnyBlock) {
    await writeToStdout("\n")
  }
}

// Resolves once the chunk is flushed (or queued), giving us backpressure
// between file blocks so a slow consumer can't make us buffer the whole diff.
function writeToStdout(chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(chunk, (error) => {
      if (error == null) {
        resolve()
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
    "  suiseki themes              List available themes",
    "  suiseki config              Print full config reference as annotated TOML",
    "  suiseki config --init       Create ~/.suiseki/config.toml",
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
    "  --max-file-lines <number>",
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
