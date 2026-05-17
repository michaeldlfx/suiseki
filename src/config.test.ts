import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigError, DEFAULT_CONFIG, loadConfig } from "./config"

type EnvironmentSnapshot = Record<string, string | undefined>

const ENVIRONMENT_KEYS = [
  "HOME",
  "SUISEKI_CONFIG_DIR",
  "SUISEKI_PIERRE_CHANGE_INDICATOR",
  "SUISEKI_PIERRE_DIFF_BACKGROUND",
  "SUISEKI_PIERRE_FILE_HEADER",
  "SUISEKI_PIERRE_HUNK_HEADER",
  "SUISEKI_PIERRE_LINE_NUMBERS",
  "SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH",
  "SUISEKI_PIERRE_VIEW",
  "SUISEKI_PIERRE_WORD_DIFF",
  "SUISEKI_SHIKI_MAX_LINE_LENGTH",
  "SUISEKI_SHIKI_THEME",
  "XDG_CONFIG_HOME",
]

let environmentSnapshot: EnvironmentSnapshot
let temporaryHomeDirectory: string
let explicitConfigDirectory: string
let xdgConfigDirectory: string

describe("config.ts", () => {
  beforeEach(async () => {
    environmentSnapshot = snapshotEnvironment()
    temporaryHomeDirectory = await mkdtemp(join(tmpdir(), "suiseki-home-"))
    explicitConfigDirectory = join(temporaryHomeDirectory, "explicit")
    xdgConfigDirectory = join(temporaryHomeDirectory, "xdg")

    resetConfigEnvironment()
    Bun.env.HOME = temporaryHomeDirectory
    Bun.env.SUISEKI_CONFIG_DIR = explicitConfigDirectory
    Bun.env.XDG_CONFIG_HOME = xdgConfigDirectory
  })

  afterEach(() => {
    restoreEnvironment(environmentSnapshot)
  })

  describe("loadConfig", () => {
    test("returns built-in defaults when no config file or env override exists", async () => {
      const loadedConfig = await loadConfig()

      expect(loadedConfig).toEqual(DEFAULT_CONFIG)
    })

    test("loads pierre and shiki sections from TOML", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        [
          "[pierre]",
          'view = "split"',
          "line-numbers = false",
          'change-indicator = "bar"',
          "diff-background = false",
          "file-header = false",
          'hunk-header = "none"',
          'word-diff = "word-alt"',
          "max-line-diff-length = 250",
          "",
          "[shiki]",
          'theme = "github-light"',
          "max-line-length = 5000",
        ].join("\n"),
      )

      const loadedConfig = await loadConfig()

      expect(loadedConfig).toEqual({
        pierre: {
          view: "split",
          "line-numbers": false,
          "change-indicator": "bar",
          "diff-background": false,
          "file-header": false,
          "hunk-header": "none",
          "word-diff": "word-alt",
          "max-line-diff-length": 250,
        },
        shiki: {
          theme: "github-light",
          "max-line-length": 5000,
        },
      })
    })

    test("merges partial config with defaults", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        ["[shiki]", 'theme = "github-light"'].join("\n"),
      )

      const loadedConfig = await loadConfig()

      expect(loadedConfig.shiki.theme).toEqual("github-light")
      expect(loadedConfig.pierre).toEqual(DEFAULT_CONFIG.pierre)
      expect(loadedConfig.shiki["max-line-length"]).toEqual(
        DEFAULT_CONFIG.shiki["max-line-length"],
      )
    })

    test("merges per-repo config above user config", async () => {
      const repositoryDirectory = join(temporaryHomeDirectory, "repo")
      const nestedDirectory = join(repositoryDirectory, "packages", "cli")
      await mkdir(explicitConfigDirectory, { recursive: true })
      await mkdir(nestedDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        [
          "[pierre]",
          'view = "unified"',
          "line-numbers = false",
          "",
          "[shiki]",
          'theme = "github-light"',
        ].join("\n"),
      )
      await writeFile(
        join(repositoryDirectory, ".suiseki.toml"),
        [
          "[pierre]",
          'view = "split"',
          'word-diff = "none"',
          "",
          "[shiki]",
          "max-line-length = 700",
        ].join("\n"),
      )

      const loadedConfig = await loadConfig({
        currentWorkingDirectory: nestedDirectory,
      })

      expect(loadedConfig.pierre.view).toEqual("split")
      expect(loadedConfig.pierre["line-numbers"]).toEqual(false)
      expect(loadedConfig.pierre["word-diff"]).toEqual("none")
      expect(loadedConfig.shiki.theme).toEqual("github-light")
      expect(loadedConfig.shiki["max-line-length"]).toEqual(700)
    })

    test("uses nearest per-repo config when walking up from cwd", async () => {
      const repositoryDirectory = join(temporaryHomeDirectory, "repo")
      const packageDirectory = join(repositoryDirectory, "packages", "cli")
      const nestedDirectory = join(packageDirectory, "src")
      await mkdir(nestedDirectory, { recursive: true })
      await writeFile(
        join(repositoryDirectory, ".suiseki.toml"),
        ["[pierre]", 'word-diff = "none"'].join("\n"),
      )
      await writeFile(
        join(packageDirectory, ".suiseki.toml"),
        ["[pierre]", 'word-diff = "char"'].join("\n"),
      )

      const loadedConfig = await loadConfig({
        currentWorkingDirectory: nestedDirectory,
      })

      expect(loadedConfig.pierre["word-diff"]).toEqual("char")
    })

    test("applies pierre environment overrides above config file", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        ["[pierre]", "line-numbers = false", 'change-indicator = "bar"'].join(
          "\n",
        ),
      )
      Bun.env.SUISEKI_PIERRE_LINE_NUMBERS = "on"
      Bun.env.SUISEKI_PIERRE_CHANGE_INDICATOR = "sign"
      Bun.env.SUISEKI_PIERRE_WORD_DIFF = "none"
      Bun.env.SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH = "400"

      const loadedConfig = await loadConfig()

      expect(loadedConfig.pierre["line-numbers"]).toEqual(true)
      expect(loadedConfig.pierre["change-indicator"]).toEqual("sign")
      expect(loadedConfig.pierre["word-diff"]).toEqual("none")
      expect(loadedConfig.pierre["max-line-diff-length"]).toEqual(400)
    })

    test("applies environment overrides above per-repo config", async () => {
      const repositoryDirectory = join(temporaryHomeDirectory, "repo")
      await mkdir(repositoryDirectory, { recursive: true })
      await writeFile(
        join(repositoryDirectory, ".suiseki.toml"),
        ["[pierre]", 'view = "split"'].join("\n"),
      )
      Bun.env.SUISEKI_PIERRE_VIEW = "unified"

      const loadedConfig = await loadConfig({
        currentWorkingDirectory: repositoryDirectory,
      })

      expect(loadedConfig.pierre.view).toEqual("unified")
    })

    test("applies CLI overrides above environment overrides", async () => {
      Bun.env.SUISEKI_PIERRE_VIEW = "split"

      const loadedConfig = await loadConfig({
        overrides: {
          pierre: {
            view: "unified",
          },
        },
      })

      expect(loadedConfig.pierre.view).toEqual("unified")
    })

    test("applies shiki environment overrides above config file", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        ["[shiki]", 'theme = "github-light"', "max-line-length = 5000"].join(
          "\n",
        ),
      )
      Bun.env.SUISEKI_SHIKI_THEME = "github-dark"
      Bun.env.SUISEKI_SHIKI_MAX_LINE_LENGTH = "500"

      const loadedConfig = await loadConfig()

      expect(loadedConfig.shiki.theme).toEqual("github-dark")
      expect(loadedConfig.shiki["max-line-length"]).toEqual(500)
    })

    test("rejects unknown top-level TOML keys", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        ['theme = "github-dark"'].join("\n"),
      )

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow("unsupported key")
    })

    test("rejects unknown keys inside pierre section", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        ["[pierre]", "unknown-option = true"].join("\n"),
      )

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow("unsupported key")
    })

    test("rejects unknown keys inside shiki section", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        ["[shiki]", "unknown-option = true"].join("\n"),
      )

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow("unsupported key")
    })

    test("rejects invalid pierre environment booleans", async () => {
      Bun.env.SUISEKI_PIERRE_LINE_NUMBERS = "sometimes"

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow("SUISEKI_PIERRE_LINE_NUMBERS")
    })

    test("rejects unknown Shiki themes", async () => {
      Bun.env.SUISEKI_SHIKI_THEME = "not-a-theme"

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow("bundled Shiki theme")
    })

    test("rejects invalid SUISEKI_SHIKI_MAX_LINE_LENGTH", async () => {
      Bun.env.SUISEKI_SHIKI_MAX_LINE_LENGTH = "abc"

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow(
        "SUISEKI_SHIKI_MAX_LINE_LENGTH",
      )
    })

    test("rejects invalid SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH", async () => {
      Bun.env.SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH = "0"

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow(
        "SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH",
      )
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

function resetConfigEnvironment(): void {
  for (const key of ENVIRONMENT_KEYS) {
    delete Bun.env[key]
  }
}

function restoreEnvironment(snapshot: EnvironmentSnapshot): void {
  for (const key of ENVIRONMENT_KEYS) {
    setEnvironmentValue(key, snapshot[key])
  }
}

function setEnvironmentValue(key: string, value: string | undefined): void {
  if (value == null) {
    delete Bun.env[key]
    return
  }

  Bun.env[key] = value
}
