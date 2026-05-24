import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "smol-toml"
import { getDefaultConfigPath, runInitCommandWithIO } from "./init-command"

type EnvironmentSnapshot = Record<string, string | undefined>

const ENVIRONMENT_KEYS = ["HOME"]

let stdoutChunks: string[]
let originalWrite: typeof process.stdout.write
let temporaryDirectory: string
let environmentSnapshot: EnvironmentSnapshot

describe("init-command.ts", () => {
  beforeEach(async () => {
    environmentSnapshot = snapshotEnvironment()
    temporaryDirectory = await mkdtemp(join(tmpdir(), "suiseki-init-cmd-"))

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

  describe("getDefaultConfigPath", () => {
    test("returns ~/.suiseki/config.toml using HOME env var", () => {
      Bun.env.HOME = temporaryDirectory

      const configPath = getDefaultConfigPath()

      expect(configPath).toEqual(
        join(temporaryDirectory, ".suiseki", "config.toml"),
      )
    })

    test("falls back to homedir() when HOME is not set", () => {
      Bun.env.HOME = undefined

      const configPath = getDefaultConfigPath()

      expect(configPath).toEqual(join(homedir(), ".suiseki", "config.toml"))
    })
  })

  describe("runInitCommandWithIO", () => {
    test("creates config file at the chosen path", async () => {
      const targetPath = join(temporaryDirectory, "suiseki", "config.toml")

      await runInitCommandWithIO({
        targetPath,
        io: { promptOverwrite: async () => false },
      })

      expect(await Bun.file(targetPath).exists()).toEqual(true)
    })

    test("written file is valid TOML with default values", async () => {
      const targetPath = join(temporaryDirectory, "suiseki", "config.toml")

      await runInitCommandWithIO({
        targetPath,
        io: { promptOverwrite: async () => false },
      })

      const parsed = parse(await Bun.file(targetPath).text())
      expect(parsed).toMatchObject({
        pierre: { view: "unified", "line-numbers": true },
        shiki: { theme: "pierre-dark" },
      })
    })

    test("prints the created path to stdout", async () => {
      const targetPath = join(temporaryDirectory, "suiseki", "config.toml")

      await runInitCommandWithIO({
        targetPath,
        io: { promptOverwrite: async () => false },
      })

      expect(stdoutChunks.join("")).toContain(`Created: ${targetPath}`)
    })

    test("does not write when file exists and overwrite is declined", async () => {
      const targetPath = join(temporaryDirectory, "config.toml")
      await Bun.write(targetPath, "original content")

      await runInitCommandWithIO({
        targetPath,
        io: { promptOverwrite: async () => false },
      })

      expect(await Bun.file(targetPath).text()).toEqual("original content")
    })

    test("prints Aborted when overwrite is declined", async () => {
      const targetPath = join(temporaryDirectory, "config.toml")
      await Bun.write(targetPath, "original content")

      await runInitCommandWithIO({
        targetPath,
        io: { promptOverwrite: async () => false },
      })

      expect(stdoutChunks.join("")).toContain("Aborted.")
    })

    test("overwrites file when overwrite is confirmed", async () => {
      const targetPath = join(temporaryDirectory, "config.toml")
      await Bun.write(targetPath, "original content")

      await runInitCommandWithIO({
        targetPath,
        io: { promptOverwrite: async () => true },
      })

      const content = await Bun.file(targetPath).text()
      expect(content).not.toEqual("original content")
      expect(content).toContain("[pierre]")
    })

    test("creates parent directories if they do not exist", async () => {
      const targetPath = join(
        temporaryDirectory,
        "deep",
        "nested",
        "config.toml",
      )

      await runInitCommandWithIO({
        targetPath,
        io: { promptOverwrite: async () => false },
      })

      expect(await Bun.file(targetPath).exists()).toEqual(true)
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
    Bun.env[key] = snapshot[key]
  }
}
