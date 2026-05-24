import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "smol-toml"
import { getInitPathCandidates, runInitCommandWithIO } from "./init-command"

type EnvironmentSnapshot = Record<string, string | undefined>

const ENVIRONMENT_KEYS = ["HOME", "XDG_CONFIG_HOME"]

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

  describe("getInitPathCandidates", () => {
    test("returns XDG path using XDG_CONFIG_HOME when set", () => {
      Bun.env.XDG_CONFIG_HOME = join(temporaryDirectory, "xdg")
      Bun.env.HOME = temporaryDirectory

      const [xdgPath] = getInitPathCandidates()

      expect(xdgPath).toEqual(
        join(temporaryDirectory, "xdg", "suiseki", "config.toml"),
      )
    })

    test("falls back to ~/.config when XDG_CONFIG_HOME is not set", () => {
      Bun.env.XDG_CONFIG_HOME = undefined
      Bun.env.HOME = temporaryDirectory

      const [xdgPath] = getInitPathCandidates()

      expect(xdgPath).toEqual(
        join(temporaryDirectory, ".config", "suiseki", "config.toml"),
      )
    })

    test("returns legacy ~/.suiseki path as second candidate", () => {
      Bun.env.HOME = temporaryDirectory

      const [, legacyPath] = getInitPathCandidates()

      expect(legacyPath).toEqual(
        join(temporaryDirectory, ".suiseki", "config.toml"),
      )
    })

    test("uses homedir() when HOME is not set", () => {
      Bun.env.HOME = undefined
      Bun.env.XDG_CONFIG_HOME = undefined

      const [, legacyPath] = getInitPathCandidates()

      expect(legacyPath).toEqual(join(homedir(), ".suiseki", "config.toml"))
    })
  })

  describe("runInitCommandWithIO", () => {
    test("creates config file at the chosen path", async () => {
      const targetPath = join(temporaryDirectory, "suiseki", "config.toml")

      await runInitCommandWithIO({
        promptPathChoice: async () => targetPath,
        promptOverwrite: async () => false,
      })

      const writtenFile = Bun.file(targetPath)
      expect(await writtenFile.exists()).toEqual(true)
    })

    test("written file is valid TOML with default values", async () => {
      const targetPath = join(temporaryDirectory, "suiseki", "config.toml")

      await runInitCommandWithIO({
        promptPathChoice: async () => targetPath,
        promptOverwrite: async () => false,
      })

      const content = await Bun.file(targetPath).text()
      const parsed = parse(content)
      expect(parsed).toMatchObject({
        pierre: { view: "unified", "line-numbers": true },
        shiki: { theme: "pierre-dark" },
      })
    })

    test("prints the created path to stdout", async () => {
      const targetPath = join(temporaryDirectory, "suiseki", "config.toml")

      await runInitCommandWithIO({
        promptPathChoice: async () => targetPath,
        promptOverwrite: async () => false,
      })

      const output = stdoutChunks.join("")
      expect(output).toContain(`Created: ${targetPath}`)
    })

    test("does not write when file exists and overwrite is declined", async () => {
      const targetPath = join(temporaryDirectory, "config.toml")
      await Bun.write(targetPath, "original content")

      await runInitCommandWithIO({
        promptPathChoice: async () => targetPath,
        promptOverwrite: async () => false,
      })

      const content = await Bun.file(targetPath).text()
      expect(content).toEqual("original content")
    })

    test("prints Aborted when overwrite is declined", async () => {
      const targetPath = join(temporaryDirectory, "config.toml")
      await Bun.write(targetPath, "original content")

      await runInitCommandWithIO({
        promptPathChoice: async () => targetPath,
        promptOverwrite: async () => false,
      })

      const output = stdoutChunks.join("")
      expect(output).toContain("Aborted.")
    })

    test("overwrites file when overwrite is confirmed", async () => {
      const targetPath = join(temporaryDirectory, "config.toml")
      await Bun.write(targetPath, "original content")

      await runInitCommandWithIO({
        promptPathChoice: async () => targetPath,
        promptOverwrite: async () => true,
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
        promptPathChoice: async () => targetPath,
        promptOverwrite: async () => false,
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
