import { homedir } from "node:os"
import { join } from "node:path"
import { type } from "arktype"
import { type BundledTheme, bundledThemes } from "shiki"
import { parse } from "smol-toml"

export const vSuisekiConfig = type({
  theme: "string",
  view: '"unified"',
  "line-numbers": "boolean",
  "change-indicator": '"sign" | "bar" | "background"',
})
type ConfigKey = "theme" | "view" | "line-numbers" | "change-indicator"

const CONFIGURATION_KEYS: ConfigKey[] = [
  "theme",
  "view",
  "line-numbers",
  "change-indicator",
]

export type SuisekiConfig = typeof vSuisekiConfig.infer

type ConfigFileData = Partial<Record<ConfigKey, unknown>>

export const DEFAULT_CONFIG: SuisekiConfig = {
  theme: "github-dark",
  view: "unified",
  "line-numbers": true,
  "change-indicator": "sign",
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
  const mergedConfiguration = {
    ...DEFAULT_CONFIG,
    ...(loadedConfigFile?.configuration ?? {}),
    ...readEnvironmentOverrides(),
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

  if (Bun.env.SUISEKI_THEME != null && Bun.env.SUISEKI_THEME !== "") {
    environmentOverrides.theme = Bun.env.SUISEKI_THEME
  }

  if (Bun.env.SUISEKI_VIEW != null && Bun.env.SUISEKI_VIEW !== "") {
    environmentOverrides.view = Bun.env.SUISEKI_VIEW
  }

  if (
    Bun.env.SUISEKI_LINE_NUMBERS != null &&
    Bun.env.SUISEKI_LINE_NUMBERS !== ""
  ) {
    environmentOverrides["line-numbers"] = parseEnvironmentBoolean({
      name: "SUISEKI_LINE_NUMBERS",
      value: Bun.env.SUISEKI_LINE_NUMBERS,
    })
  }

  if (
    Bun.env.SUISEKI_CHANGE_INDICATOR != null &&
    Bun.env.SUISEKI_CHANGE_INDICATOR !== ""
  ) {
    environmentOverrides["change-indicator"] = Bun.env.SUISEKI_CHANGE_INDICATOR
  }

  return environmentOverrides
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

  if (!isBundledThemeName(validatedConfiguration.theme)) {
    throw new ConfigError(
      `Invalid suiseki configuration from ${source}: theme must be a bundled Shiki theme name`,
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
  const unknownKeys = Object.keys(value).filter(
    (key) =>
      !CONFIGURATION_KEYS.some((configurationKey) => configurationKey === key),
  )

  if (unknownKeys.length > 0) {
    throw new ConfigError(
      `${configFilePath} contains unsupported key(s): ${unknownKeys.join(", ")}`,
    )
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
