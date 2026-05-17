import { homedir } from "node:os"
import { join } from "node:path"
import { type } from "arktype"
import { type BundledTheme, bundledThemes } from "shiki"
import { parse } from "smol-toml"

export const vPierreConfig = type({
  view: '"unified"',
  "line-numbers": "boolean",
  "change-indicator": '"sign" | "bar" | "background"',
  "diff-background": "boolean",
  "file-header": "boolean",
  "hunk-header": '"full" | "none"',
})

export const vShikiConfig = type({
  theme: "string",
  "max-line-length": "number",
})

export const vSuisekiConfig = type({
  pierre: vPierreConfig,
  shiki: vShikiConfig,
})

type PierreKey =
  | "view"
  | "line-numbers"
  | "change-indicator"
  | "diff-background"
  | "file-header"
  | "hunk-header"
type ShikiKey = "theme" | "max-line-length"

const TOP_LEVEL_KEYS = ["pierre", "shiki"] as const
const PIERRE_KEYS: PierreKey[] = [
  "view",
  "line-numbers",
  "change-indicator",
  "diff-background",
  "file-header",
  "hunk-header",
]
const SHIKI_KEYS: ShikiKey[] = ["theme", "max-line-length"]

export type SuisekiConfig = typeof vSuisekiConfig.infer

type ConfigFileData = {
  pierre?: Partial<Record<PierreKey, unknown>>
  shiki?: Partial<Record<ShikiKey, unknown>>
}

export const DEFAULT_CONFIG: SuisekiConfig = {
  pierre: {
    view: "unified",
    "line-numbers": true,
    "change-indicator": "sign",
    "diff-background": true,
    "file-header": true,
    "hunk-header": "none",
  },
  shiki: {
    theme: "github-dark",
    "max-line-length": 10000,
  },
}

export class ConfigError extends Error {
  override name = "ConfigError"
}

type LoadedConfigFile = {
  configuration: ConfigFileData
  path: string
}

export async function loadConfig(): Promise<SuisekiConfig> {
  const loadedConfigFile = await loadFirstConfigFile()
  const fileConfiguration = loadedConfigFile?.configuration ?? {}
  const environmentOverrides = readEnvironmentOverrides()

  const mergedConfiguration = {
    pierre: {
      ...DEFAULT_CONFIG.pierre,
      ...(fileConfiguration.pierre ?? {}),
      ...(environmentOverrides.pierre ?? {}),
    },
    shiki: {
      ...DEFAULT_CONFIG.shiki,
      ...(fileConfiguration.shiki ?? {}),
      ...(environmentOverrides.shiki ?? {}),
    },
  }

  return validateConfig(
    mergedConfiguration,
    loadedConfigFile?.path ?? "defaults",
  )
}

function getConfigFileCandidates(): string[] {
  const homeDirectory = homedir()
  const configFileCandidates: string[] = []
  const explicitConfigDirectory = Bun.env.SUISEKI_CONFIG_DIR

  if (explicitConfigDirectory != null && explicitConfigDirectory !== "") {
    configFileCandidates.push(join(explicitConfigDirectory, "config.toml"))
  }

  const xdgConfigDirectory =
    Bun.env.XDG_CONFIG_HOME != null && Bun.env.XDG_CONFIG_HOME !== ""
      ? Bun.env.XDG_CONFIG_HOME
      : join(homeDirectory, ".config")

  configFileCandidates.push(join(xdgConfigDirectory, "suiseki", "config.toml"))
  configFileCandidates.push(join(homeDirectory, ".suiseki", "config.toml"))

  return configFileCandidates
}

async function loadFirstConfigFile(): Promise<LoadedConfigFile | undefined> {
  for (const configFilePath of getConfigFileCandidates()) {
    const configFile = Bun.file(configFilePath)
    if (await configFile.exists()) {
      const fileText = await configFile.text()
      return {
        configuration: parseConfigFile(fileText, configFilePath),
        path: configFilePath,
      }
    }
  }

  return undefined
}

function parseConfigFile(
  fileText: string,
  configFilePath: string,
): ConfigFileData {
  let parsedConfig: unknown

  try {
    parsedConfig = parse(fileText)
  } catch (error) {
    throw new ConfigError(
      `Failed to parse ${configFilePath}: ${getErrorMessage(error)}`,
    )
  }

  assertPlainObject(parsedConfig, configFilePath)
  assertKnownConfigKeys(parsedConfig, configFilePath)

  return parsedConfig
}

function readEnvironmentOverrides(): ConfigFileData {
  const environmentOverrides: ConfigFileData = {}

  const pierreOverrides = readPierreEnvironmentOverrides()
  if (Object.keys(pierreOverrides).length > 0) {
    environmentOverrides.pierre = pierreOverrides
  }

  const shikiOverrides = readShikiEnvironmentOverrides()
  if (Object.keys(shikiOverrides).length > 0) {
    environmentOverrides.shiki = shikiOverrides
  }

  return environmentOverrides
}

function readPierreEnvironmentOverrides(): Partial<Record<PierreKey, unknown>> {
  const overrides: Partial<Record<PierreKey, unknown>> = {}

  if (
    Bun.env.SUISEKI_PIERRE_VIEW != null &&
    Bun.env.SUISEKI_PIERRE_VIEW !== ""
  ) {
    overrides.view = Bun.env.SUISEKI_PIERRE_VIEW
  }

  if (
    Bun.env.SUISEKI_PIERRE_LINE_NUMBERS != null &&
    Bun.env.SUISEKI_PIERRE_LINE_NUMBERS !== ""
  ) {
    overrides["line-numbers"] = parseEnvironmentBoolean({
      name: "SUISEKI_PIERRE_LINE_NUMBERS",
      value: Bun.env.SUISEKI_PIERRE_LINE_NUMBERS,
    })
  }

  if (
    Bun.env.SUISEKI_PIERRE_CHANGE_INDICATOR != null &&
    Bun.env.SUISEKI_PIERRE_CHANGE_INDICATOR !== ""
  ) {
    overrides["change-indicator"] = Bun.env.SUISEKI_PIERRE_CHANGE_INDICATOR
  }

  if (
    Bun.env.SUISEKI_PIERRE_DIFF_BACKGROUND != null &&
    Bun.env.SUISEKI_PIERRE_DIFF_BACKGROUND !== ""
  ) {
    overrides["diff-background"] = parseEnvironmentBoolean({
      name: "SUISEKI_PIERRE_DIFF_BACKGROUND",
      value: Bun.env.SUISEKI_PIERRE_DIFF_BACKGROUND,
    })
  }

  if (
    Bun.env.SUISEKI_PIERRE_FILE_HEADER != null &&
    Bun.env.SUISEKI_PIERRE_FILE_HEADER !== ""
  ) {
    overrides["file-header"] = parseEnvironmentBoolean({
      name: "SUISEKI_PIERRE_FILE_HEADER",
      value: Bun.env.SUISEKI_PIERRE_FILE_HEADER,
    })
  }

  if (
    Bun.env.SUISEKI_PIERRE_HUNK_HEADER != null &&
    Bun.env.SUISEKI_PIERRE_HUNK_HEADER !== ""
  ) {
    overrides["hunk-header"] = Bun.env.SUISEKI_PIERRE_HUNK_HEADER
  }

  return overrides
}

function readShikiEnvironmentOverrides(): Partial<Record<ShikiKey, unknown>> {
  const overrides: Partial<Record<ShikiKey, unknown>> = {}

  if (
    Bun.env.SUISEKI_SHIKI_THEME != null &&
    Bun.env.SUISEKI_SHIKI_THEME !== ""
  ) {
    overrides.theme = Bun.env.SUISEKI_SHIKI_THEME
  }

  if (
    Bun.env.SUISEKI_SHIKI_MAX_LINE_LENGTH != null &&
    Bun.env.SUISEKI_SHIKI_MAX_LINE_LENGTH !== ""
  ) {
    const parsedValue = Number(Bun.env.SUISEKI_SHIKI_MAX_LINE_LENGTH)

    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      throw new ConfigError(
        "SUISEKI_SHIKI_MAX_LINE_LENGTH must be a positive number",
      )
    }

    overrides["max-line-length"] = parsedValue
  }

  return overrides
}

type ParseEnvironmentBooleanParams = {
  name: string
  value: string
}

function parseEnvironmentBoolean({
  name,
  value,
}: ParseEnvironmentBooleanParams): boolean {
  const normalizedValue = value.toLowerCase()

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false
  }

  throw new ConfigError(
    `${name} must be one of true, false, 1, 0, yes, no, on, or off`,
  )
}

function validateConfig(configuration: unknown, source: string): SuisekiConfig {
  const validatedConfiguration = vSuisekiConfig(configuration)

  if (validatedConfiguration instanceof type.errors) {
    throw new ConfigError(
      `Invalid suiseki configuration from ${source}: ${validatedConfiguration.summary}`,
    )
  }

  if (!isBundledThemeName(validatedConfiguration.shiki.theme)) {
    throw new ConfigError(
      `Invalid suiseki configuration from ${source}: shiki.theme must be a bundled Shiki theme name`,
    )
  }
  return validatedConfiguration
}

export function isBundledThemeName(
  themeName: string,
): themeName is BundledTheme {
  return Object.hasOwn(bundledThemes, themeName)
}

function assertPlainObject(
  value: unknown,
  configFilePath: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new ConfigError(`${configFilePath} must contain a TOML table`)
  }
}

function assertKnownConfigKeys(
  value: Record<string, unknown>,
  configFilePath: string,
): asserts value is ConfigFileData {
  assertKnownKeysInSet(Object.keys(value), TOP_LEVEL_KEYS, configFilePath)

  if (value.pierre != null) {
    assertPlainObject(value.pierre, `${configFilePath} [pierre]`)
    assertKnownKeysInSet(
      Object.keys(value.pierre),
      PIERRE_KEYS,
      `${configFilePath} [pierre]`,
    )
  }

  if (value.shiki != null) {
    assertPlainObject(value.shiki, `${configFilePath} [shiki]`)
    assertKnownKeysInSet(
      Object.keys(value.shiki),
      SHIKI_KEYS,
      `${configFilePath} [shiki]`,
    )
  }
}

function assertKnownKeysInSet(
  keys: string[],
  allowedKeys: readonly string[],
  source: string,
): void {
  const unknownKeys = keys.filter(
    (key) => !allowedKeys.some((allowed) => allowed === key),
  )

  if (unknownKeys.length > 0) {
    throw new ConfigError(
      `${source} contains unsupported key(s): ${unknownKeys.join(", ")}`,
    )
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
