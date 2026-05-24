import { describe, expect, test } from "bun:test"
import { version } from "./version"

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
  describe("--version", () => {
    test("prints the suiseki version and exits zero", async () => {
      const { exitCode, stdout, stderr } = await runCli(["--version"])

      expect(exitCode).toEqual(0)
      expect(stdout).toEqual(`suiseki ${version}\n`)
      expect(stderr).toEqual("")
    })

    test("supports the -v short flag", async () => {
      const { exitCode, stdout } = await runCli(["-v"])

      expect(exitCode).toEqual(0)
      expect(stdout).toEqual(`suiseki ${version}\n`)
    })
  })

  describe("upgrade subcommand", () => {
    test("refuses to upgrade when running from source, before any network call", async () => {
      const { exitCode, stdout, stderr } = await runCli(["upgrade"])

      expect(exitCode).toEqual(1)
      expect(stdout).toEqual("")
      expect(stderr).toContain("only works on an installed suiseki binary")
    })
  })

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
