import { loadConfig, parseEnvironmentBoolean } from "./config"
import { renderDiff } from "./render/diff"

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
  const cliArguments = process.argv.slice(2)
  const noPager =
    cliArguments.includes("--no-pager") ||
    (Bun.env.SUISEKI_NO_PAGER != null &&
      Bun.env.SUISEKI_NO_PAGER !== "" &&
      parseEnvironmentBoolean({
        name: "SUISEKI_NO_PAGER",
        value: Bun.env.SUISEKI_NO_PAGER,
      }))
  const filteredArguments = cliArguments.filter(
    (argument) => argument !== "--no-pager",
  )
  const configuration = await loadConfig()
  const patch = await readPatchInput(filteredArguments)

  if (patch.trim() === "") {
    return
  }

  const renderedDiff = await renderDiff(patch, configuration)

  if (renderedDiff === "") {
    return
  }

  const output = `${renderedDiff}\n`

  if (!noPager && process.stdout.isTTY === true) {
    await writeWithPager(output)
  } else {
    process.stdout.write(output)
  }
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
