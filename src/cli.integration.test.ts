import { describe, expect, test } from "bun:test"

async function runCli(cliArguments: string[]): Promise<{
  exitCode: number
  stdout: string
  stderr: string
}> {
  const subprocess = Bun.spawn(["bun", "run", "src/cli.ts", ...cliArguments], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ])
  return { exitCode, stdout, stderr }
}

describe("cli.ts", () => {
  describe("config subcommand", () => {
    test("prints the annotated reference when given no argument", async () => {
      const { exitCode, stdout } = await runCli(["config"])

      expect(exitCode).toEqual(0)
      expect(stdout).toContain("[pierre]")
      expect(stdout).toContain("[shiki]")
    })

    test("exits non-zero with guidance for an unknown argument", async () => {
      const { exitCode, stdout, stderr } = await runCli(["config", "--bogus"])

      expect(exitCode).toEqual(1)
      expect(stdout).toEqual("")
      expect(stderr).toContain("Unknown argument for 'config': --bogus")
      expect(stderr).toContain("config --init")
    })
  })
})
