import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { stripAnsi } from "./ansi"
import { version } from "./version"

type CliResult = {
  exitCode: number
  stdout: string
  stderr: string
}

async function runCli(cliArguments: string[]): Promise<CliResult> {
  return runProcess(["bun", "run", "src/cli.ts", ...cliArguments], {})
}

async function runProcess(
  command: string[],
  options: { cwd?: string; env?: Record<string, string>; input?: string },
): Promise<CliResult> {
  const subprocess = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...hermeticEnv, ...(options.env ?? {}) },
    stdin: options.input == null ? "ignore" : Buffer.from(options.input),
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

let workspace: string
let configHome: string
let satBinary: string
// Spawned processes run with this env so they ignore the developer's SUISEKI_*
// variables and ~/.suiseki config and exercise built-in defaults instead.
let hermeticEnv: Record<string, string> = {}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "suiseki-view-"))
  await writeFile(
    join(workspace, "greeting.ts"),
    'const greeting: string = "hello"\n',
  )
  await mkdir(join(workspace, "lib"))
  await writeFile(join(workspace, "lib", "util.ts"), "export const util = 1\n")
  await writeFile(join(workspace, "data.bin"), new Uint8Array([0, 1, 2, 0, 3]))

  satBinary = join(workspace, "sat")
  const build = Bun.spawn(
    [
      "bun",
      "build",
      `${import.meta.dir}/cli.ts`,
      "--compile",
      "--outfile",
      satBinary,
    ],
    { stdout: "ignore", stderr: "ignore" },
  )
  await build.exited

  configHome = await mkdtemp(join(tmpdir(), "suiseki-empty-"))
  hermeticEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value != null && !key.startsWith("SUISEKI_")) {
      hermeticEnv[key] = value
    }
  }
  // Point every config-discovery location at an empty directory so no user
  // config.toml is found (HOME → ~/.suiseki, XDG_CONFIG_HOME → suiseki/, and the
  // explicit SUISEKI_CONFIG_DIR all resolve under the empty dir).
  hermeticEnv.HOME = configHome
  hermeticEnv.XDG_CONFIG_HOME = configHome
  hermeticEnv.SUISEKI_CONFIG_DIR = configHome
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
  await rm(configHome, { recursive: true, force: true })
})

function runSat(
  satArguments: string[],
  options: { input?: string },
): Promise<CliResult> {
  return runProcess([satBinary, ...satArguments], {
    cwd: workspace,
    ...options,
  })
}

describe("view subcommand", () => {
  test("highlights a file with a header naming the language", async () => {
    const { exitCode, stdout } = await runCli([
      "view",
      join(workspace, "greeting.ts"),
    ])
    const plain = stripAnsi(stdout)

    expect(exitCode).toEqual(0)
    expect(plain).toContain("greeting.ts")
    expect(plain).toContain("typescript")
    expect(plain).toContain("const greeting")
  })

  test("trees a directory argument", async () => {
    const { exitCode, stdout } = await runCli(["view", workspace])
    const plain = stripAnsi(stdout)

    expect(exitCode).toEqual(0)
    expect(plain).toContain("▾ lib/")
    expect(plain).toContain("util.ts")
  })

  test("drops directory glyphs with --no-icons", async () => {
    const { stdout } = await runCli(["view", workspace, "--no-icons"])

    expect(stripAnsi(stdout)).not.toContain("▾")
  })

  test("reports a missing path on stderr", async () => {
    const { exitCode, stdout, stderr } = await runCli([
      "view",
      join(workspace, "nope.ts"),
    ])

    expect(exitCode).toEqual(1)
    expect(stdout).toEqual("")
    expect(stderr).toContain("No such file or directory")
  })

  test("reports a binary file on stderr and writes nothing to stdout", async () => {
    const { exitCode, stdout, stderr } = await runCli([
      "view",
      join(workspace, "data.bin"),
    ])

    expect(exitCode).toEqual(0)
    expect(stdout).toEqual("")
    expect(stderr).toContain("binary file")
  })

  test("reads file content from stdin via -", async () => {
    const { exitCode, stdout } = await runProcess(
      ["bun", "run", "src/cli.ts", "view", "-"],
      { input: "const fromStdin = 1\n" },
    )

    expect(exitCode).toEqual(0)
    expect(stripAnsi(stdout)).toContain("const fromStdin")
  })
})

describe("sat symlink dispatch", () => {
  test("views a file when invoked as `sat <file>`", async () => {
    const { exitCode, stdout } = await runSat(["greeting.ts"], {})
    const plain = stripAnsi(stdout)

    expect(exitCode).toEqual(0)
    expect(plain).toContain("typescript")
    expect(plain).toContain("const greeting")
  })

  test("trees a directory when invoked as `sat <dir>`", async () => {
    const { exitCode, stdout } = await runSat(["lib"], {})

    expect(exitCode).toEqual(0)
    expect(stripAnsi(stdout)).toContain("util.ts")
  })

  test("views stdin when invoked as `sat -`", async () => {
    const { exitCode, stdout } = await runSat(["-"], {
      input: "const fromStdin = 2\n",
    })

    expect(exitCode).toEqual(0)
    expect(stripAnsi(stdout)).toContain("const fromStdin")
  })
})

describe("view --with-tree", () => {
  // Run from inside the workspace so the sidebar roots there (a non-repo dir).
  // `data.bin` is a sibling that only appears via the tree, never in the file's
  // own content, so it cleanly distinguishes sidebar-on from sidebar-off.
  function runViewInWorkspace(
    viewArguments: string[],
    env?: Record<string, string>,
  ): Promise<CliResult> {
    return runProcess(
      ["bun", "run", `${import.meta.dir}/cli.ts`, "view", ...viewArguments],
      { cwd: workspace, env },
    )
  }

  test("shows the file beside its surrounding directory tree", async () => {
    const { exitCode, stdout } = await runViewInWorkspace([
      "greeting.ts",
      "--with-tree",
    ])
    const plain = stripAnsi(stdout)

    expect(exitCode).toEqual(0)
    expect(plain).toContain("const greeting")
    expect(plain).toContain("│")
    expect(plain).toContain("data.bin")
  })

  test("a plain view does not include the surrounding tree", async () => {
    const { stdout } = await runViewInWorkspace(["greeting.ts"])

    expect(stripAnsi(stdout)).toContain("const greeting")
    expect(stripAnsi(stdout)).not.toContain("data.bin")
  })

  test("SUISEKI_VIEW_WITH_TREE defaults the sidebar on", async () => {
    const { stdout } = await runViewInWorkspace(["greeting.ts"], {
      SUISEKI_VIEW_WITH_TREE: "true",
    })

    expect(stripAnsi(stdout)).toContain("data.bin")
  })

  test("--with-tree=false overrides a config default back off", async () => {
    const { stdout } = await runViewInWorkspace(
      ["greeting.ts", "--with-tree=false"],
      { SUISEKI_VIEW_WITH_TREE: "true" },
    )

    expect(stripAnsi(stdout)).not.toContain("data.bin")
  })
})
