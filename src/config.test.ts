import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigError, DEFAULT_CONFIG, loadConfig } from "./config"

type EnvironmentSnapshot = Record<string, string | undefined>

const ENVIRONMENT_KEYS = [
  "HOME",
  "SUISEKI_CHANGE_INDICATOR",
  "SUISEKI_CONFIG_DIR",
  "SUISEKI_LINE_NUMBERS",
  "SUISEKI_THEME",
  "SUISEKI_VIEW",
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

    test("loads the first configured TOML file", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        [
          'theme = "github-light"',
          'view = "unified"',
          "line-numbers = false",
          'change-indicator = "bar"',
        ].join("\n"),
      )

      const loadedConfig = await loadConfig()

      expect(loadedConfig).toEqual({
        theme: "github-light",
        view: "unified",
        "line-numbers": false,
        "change-indicator": "bar",
      })
    })

    test("applies environment overrides above config files", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        [
          'theme = "github-light"',
          'view = "unified"',
          "line-numbers = false",
          'change-indicator = "bar"',
        ].join("\n"),
      )
      Bun.env.SUISEKI_THEME = "github-dark"
      Bun.env.SUISEKI_LINE_NUMBERS = "on"
      Bun.env.SUISEKI_CHANGE_INDICATOR = "sign"

      const loadedConfig = await loadConfig()

      expect(loadedConfig).toEqual({
        theme: "github-dark",
        view: "unified",
        "line-numbers": true,
        "change-indicator": "sign",
      })
    })

    test("rejects unknown TOML keys", async () => {
      await mkdir(explicitConfigDirectory, { recursive: true })
      await writeFile(
        join(explicitConfigDirectory, "config.toml"),
        ['theme = "github-dark"', "passthrough = true"].join("\n"),
      )

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow("unsupported key")
    })

    test("rejects invalid environment booleans", async () => {
      Bun.env.SUISEKI_LINE_NUMBERS = "sometimes"

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow("SUISEKI_LINE_NUMBERS")
    })

    test("rejects unknown Shiki themes", async () => {
      Bun.env.SUISEKI_THEME = "not-a-theme"

      await expect(loadConfig()).rejects.toThrow(ConfigError)
      await expect(loadConfig()).rejects.toThrow("bundled Shiki theme")
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
