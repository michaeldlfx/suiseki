import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type } from "arktype"
import { loadCustomThemes, vCustomTheme } from "./custom-themes"

type EnvironmentSnapshot = Record<string, string | undefined>

const ENVIRONMENT_KEYS = ["HOME", "SUISEKI_CONFIG_DIR", "XDG_CONFIG_HOME"]

const MINIMAL_THEME = {
  type: "dark",
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#ffffff",
  },
}

let environmentSnapshot: EnvironmentSnapshot
let temporaryHomeDirectory: string
let explicitConfigDirectory: string
let xdgConfigDirectory: string

describe("custom-themes.ts", () => {
  beforeEach(async () => {
    environmentSnapshot = snapshotEnvironment()
    temporaryHomeDirectory = await mkdtemp(join(tmpdir(), "suiseki-themes-"))
    explicitConfigDirectory = join(temporaryHomeDirectory, "explicit")
    xdgConfigDirectory = join(temporaryHomeDirectory, "xdg")

    for (const key of ENVIRONMENT_KEYS) {
      Bun.env[key] = undefined
    }
    Bun.env.HOME = temporaryHomeDirectory
    Bun.env.SUISEKI_CONFIG_DIR = explicitConfigDirectory
    Bun.env.XDG_CONFIG_HOME = xdgConfigDirectory
  })

  afterEach(() => {
    restoreEnvironment(environmentSnapshot)
  })

  describe("loadCustomThemes", () => {
    test("returns empty when no theme directories exist", async () => {
      const customThemes = await loadCustomThemes()

      expect(customThemes).toEqual({})
    })

    test("loads JSON themes from ~/.suiseki/themes and uses filename as identifier", async () => {
      const themeDirectory = join(temporaryHomeDirectory, ".suiseki", "themes")
      await mkdir(themeDirectory, { recursive: true })
      await writeFile(
        join(themeDirectory, "midnight.json"),
        JSON.stringify({ ...MINIMAL_THEME, name: "ignored-name" }),
      )

      const customThemes = await loadCustomThemes()

      expect(Object.keys(customThemes)).toEqual(["midnight"])
      expect(customThemes.midnight?.name).toEqual("midnight")
      expect(customThemes.midnight?.colors?.["editor.background"]).toEqual(
        "#000000",
      )
    })

    test("explicit SUISEKI_CONFIG_DIR theme wins over ~/.suiseki when names collide", async () => {
      const explicitThemes = join(explicitConfigDirectory, "themes")
      const homeThemes = join(temporaryHomeDirectory, ".suiseki", "themes")
      await mkdir(explicitThemes, { recursive: true })
      await mkdir(homeThemes, { recursive: true })
      await writeFile(
        join(explicitThemes, "shared.json"),
        JSON.stringify({
          ...MINIMAL_THEME,
          colors: {
            "editor.background": "#111111",
            "editor.foreground": "#eeeeee",
          },
        }),
      )
      await writeFile(
        join(homeThemes, "shared.json"),
        JSON.stringify({
          ...MINIMAL_THEME,
          colors: {
            "editor.background": "#222222",
            "editor.foreground": "#dddddd",
          },
        }),
      )

      const customThemes = await loadCustomThemes()

      expect(customThemes.shared?.colors?.["editor.background"]).toEqual(
        "#111111",
      )
    })

    test("skips subdirectories whose names end in .json", async () => {
      const themeDirectory = join(temporaryHomeDirectory, ".suiseki", "themes")
      await mkdir(join(themeDirectory, "bogus.json"), { recursive: true })
      await writeFile(
        join(themeDirectory, "good.json"),
        JSON.stringify(MINIMAL_THEME),
      )

      const stderrWrite = process.stderr.write
      const capturedStderr: string[] = []
      process.stderr.write = ((chunk: string | Uint8Array): boolean => {
        capturedStderr.push(
          typeof chunk === "string" ? chunk : chunk.toString(),
        )
        return true
      }) as typeof process.stderr.write

      const customThemes = await loadCustomThemes()
      process.stderr.write = stderrWrite

      expect(Object.keys(customThemes)).toEqual(["good"])
      expect(capturedStderr.join("")).toEqual("")
    })

    test("skips non-JSON files", async () => {
      const themeDirectory = join(temporaryHomeDirectory, ".suiseki", "themes")
      await mkdir(themeDirectory, { recursive: true })
      await writeFile(join(themeDirectory, "README.md"), "ignored")
      await writeFile(
        join(themeDirectory, "good.json"),
        JSON.stringify(MINIMAL_THEME),
      )

      const customThemes = await loadCustomThemes()

      expect(Object.keys(customThemes)).toEqual(["good"])
    })

    test("skips malformed JSON", async () => {
      const themeDirectory = join(temporaryHomeDirectory, ".suiseki", "themes")
      await mkdir(themeDirectory, { recursive: true })
      await writeFile(join(themeDirectory, "broken.json"), "{ not json")

      const customThemes = await loadCustomThemes()

      expect(customThemes).toEqual({})
    })

    test("skips themes that fail arktype validation", async () => {
      const themeDirectory = join(temporaryHomeDirectory, ".suiseki", "themes")
      await mkdir(themeDirectory, { recursive: true })
      await writeFile(
        join(themeDirectory, "wrong-shape.json"),
        JSON.stringify({ colors: { "editor.background": 12345 } }),
      )

      const customThemes = await loadCustomThemes()

      expect(customThemes).toEqual({})
    })
  })

  describe("vCustomTheme", () => {
    test("accepts a minimal valid theme", () => {
      const validated = vCustomTheme(MINIMAL_THEME)

      expect(validated instanceof type.errors).toEqual(false)
    })

    test("rejects non-string color values", () => {
      const validated = vCustomTheme({
        colors: { "editor.background": 42 },
      })

      expect(validated instanceof type.errors).toEqual(true)
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
