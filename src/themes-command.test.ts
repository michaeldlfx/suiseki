import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runThemesCommand } from "./themes-command"

type EnvironmentSnapshot = Record<string, string | undefined>

const ENVIRONMENT_KEYS = [
  "HOME",
  "SUISEKI_CONFIG_DIR",
  "SUISEKI_SHIKI_THEME",
  "XDG_CONFIG_HOME",
]

const MINIMAL_THEME = {
  type: "dark",
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#ffffff",
  },
}

let environmentSnapshot: EnvironmentSnapshot
let temporaryHomeDirectory: string
let stdoutChunks: string[]
let originalWrite: typeof process.stdout.write

describe("themes-command.ts", () => {
  beforeEach(async () => {
    environmentSnapshot = snapshotEnvironment()
    temporaryHomeDirectory = await mkdtemp(
      join(tmpdir(), "suiseki-themes-cmd-"),
    )

    for (const key of ENVIRONMENT_KEYS) {
      Bun.env[key] = undefined
    }
    Bun.env.HOME = temporaryHomeDirectory

    stdoutChunks = []
    originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as typeof process.stdout.write
  })

  afterEach(() => {
    process.stdout.write = originalWrite
    restoreEnvironment(environmentSnapshot)
  })

  describe("runThemesCommand", () => {
    test("lists Shiki bundled, Pierre, and custom theme sections", async () => {
      await runThemesCommand()

      const output = stdoutChunks.join("")
      expect(output).toContain("Shiki bundled (")
      expect(output).toContain("github-dark")
      expect(output).toMatch(/Pierre \(\d+\):/)
      expect(output).toContain("pierre-dark")
      expect(output).toContain("pierre-light-vibrant")
      expect(output).toContain("Custom (0):")
      expect(output).toContain("(none)")
    })

    test("calls out the currently selected theme", async () => {
      Bun.env.SUISEKI_SHIKI_THEME = "pierre-light"

      await runThemesCommand()

      const output = stdoutChunks.join("")
      expect(output).toContain("Currently selected: pierre-light")
    })

    test("lists discovered custom themes by filename", async () => {
      const themeDirectory = join(temporaryHomeDirectory, ".suiseki", "themes")
      await mkdir(themeDirectory, { recursive: true })
      await writeFile(
        join(themeDirectory, "midnight.json"),
        JSON.stringify(MINIMAL_THEME),
      )

      await runThemesCommand()

      const output = stdoutChunks.join("")
      expect(output).toContain("Custom (1):")
      expect(output).toContain("midnight")
    })
  })
})

function snapshotEnvironment(): EnvironmentSnapshot {
  const snapshot: EnvironmentSnapshot = {}
  for (const key of ENVIRONMENT_KEYS) {
    snapshot[key] = Bun.env[key]
  }
  return snapshot
}

function restoreEnvironment(snapshot: EnvironmentSnapshot): void {
  for (const key of ENVIRONMENT_KEYS) {
    if (snapshot[key] == null) {
      Bun.env[key] = undefined
      continue
    }
    Bun.env[key] = snapshot[key]
  }
}
