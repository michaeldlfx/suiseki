import { loadConfig } from "./config"
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
    Bun.env.SUISEKI_NO_PAGER === "1" ||
    Bun.env.SUISEKI_NO_PAGER?.toLowerCase() === "true"
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
  const pager = Bun.spawn(["less", "-R", "--no-init", "--quit-if-one-screen"], {
    stdin: "pipe",
    stdout: "inherit",
    stderr: "inherit",
  })

  pager.stdin.write(output)
  pager.stdin.end()

  await pager.exited
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
