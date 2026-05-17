import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, extname, join } from "node:path"
import { type } from "arktype"
import type { ThemeRegistrationRaw } from "shiki"

export const vCustomTheme = type({
  "name?": "string",
  "type?": "'light' | 'dark' | 'css'",
  "colors?": {
    "[string]": "string",
  },
  "tokenColors?": "unknown[]",
  "semanticTokenColors?": {
    "[string]": "string",
  },
})
export type CustomTheme = typeof vCustomTheme.infer

const vParsedJson = type("string.json.parse")

export type CustomThemes = Record<string, ThemeRegistrationRaw>

export async function loadCustomThemes(): Promise<CustomThemes> {
  const themes: CustomThemes = {}
  for (const directory of getThemeDirectoryCandidates()) {
    const directoryEntries = await safeReaddir(directory)
    for (const entry of directoryEntries) {
      if (extname(entry) !== ".json") {
        continue
      }
      const themeName = basename(entry, ".json")
      if (Object.hasOwn(themes, themeName)) {
        continue
      }
      const theme = await loadThemeFile({
        path: join(directory, entry),
        themeName,
      })
      if (theme != null) {
        themes[themeName] = theme
      }
    }
  }
  return themes
}

function getThemeDirectoryCandidates(): string[] {
  const homeDirectory =
    Bun.env.HOME != null && Bun.env.HOME !== "" ? Bun.env.HOME : homedir()
  const candidates: string[] = []
  const explicitConfigDirectory = Bun.env.SUISEKI_CONFIG_DIR

  if (explicitConfigDirectory != null && explicitConfigDirectory !== "") {
    candidates.push(join(explicitConfigDirectory, "themes"))
  }

  const xdgConfigDirectory =
    Bun.env.XDG_CONFIG_HOME != null && Bun.env.XDG_CONFIG_HOME !== ""
      ? Bun.env.XDG_CONFIG_HOME
      : join(homeDirectory, ".config")

  candidates.push(join(xdgConfigDirectory, "suiseki", "themes"))
  candidates.push(join(homeDirectory, ".suiseki", "themes"))

  return candidates
}

async function safeReaddir(directory: string): Promise<string[]> {
  try {
    return await readdir(directory)
  } catch {
    return []
  }
}

type LoadThemeFileParams = {
  path: string
  themeName: string
}

async function loadThemeFile({
  path,
  themeName,
}: LoadThemeFileParams): Promise<ThemeRegistrationRaw | undefined> {
  const text = await readSafely(path)
  if (text == null) {
    return undefined
  }

  const parsedJson = vParsedJson(text)
  if (parsedJson instanceof type.errors) {
    process.stderr.write(
      `suiseki: skipping malformed theme JSON at ${path}: ${parsedJson.summary}\n`,
    )
    return undefined
  }

  const validated = vCustomTheme(parsedJson)
  if (validated instanceof type.errors) {
    process.stderr.write(
      `suiseki: skipping invalid theme ${path}: ${validated.summary}\n`,
    )
    return undefined
  }

  return { ...validated, name: themeName } as ThemeRegistrationRaw
}

async function readSafely(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`suiseki: cannot read theme ${path}: ${message}\n`)
    return undefined
  }
}
