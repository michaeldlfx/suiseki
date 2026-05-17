import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { type } from "arktype"
import { type BundledTheme, bundledThemes } from "shiki"
import { parse } from "smol-toml"

const vPositiveInteger = type("number.integer > 0")
const vPositiveIntegerString = type("string.numeric.parse").to(vPositiveInteger)

const PIERRE_CONFIG_FIELDS = {
  view: '"unified" | "split"',
  "line-numbers": "boolean",
  "change-indicator": '"sign" | "bar" | "background"',
  "diff-background": "boolean",
  "file-header": "boolean",
  "hunk-header": '"full" | "none"',
  "word-diff": '"word-alt" | "word" | "char" | "none"',
  "max-line-diff-length": vPositiveInteger,
} as const

const SHIKI_CONFIG_FIELDS = {
  theme: "string",
  "max-line-length": vPositiveInteger,
} as const

const CLI_PIERRE_CONFIG_FIELDS = {
  ...PIERRE_CONFIG_FIELDS,
  "max-line-diff-length": vPositiveIntegerString,
} as const

const CLI_SHIKI_CONFIG_FIELDS = {
  ...SHIKI_CONFIG_FIELDS,
  "max-line-length": vPositiveIntegerString,
} as const

export const vPierreConfig = type(PIERRE_CONFIG_FIELDS)
export const vShikiConfig = type(SHIKI_CONFIG_FIELDS)
export const vCliPierreConfig = type(CLI_PIERRE_CONFIG_FIELDS)
export const vCliShikiConfig = type(CLI_SHIKI_CONFIG_FIELDS)

export const vSuisekiConfig = type({
  pierre: vPierreConfig,
  shiki: vShikiConfig,
})

export const vPierreConfigOverrides = vPierreConfig.partial()
export const vShikiConfigOverrides = vShikiConfig.partial()
export const vSuisekiConfigOverrides = type({
  "pierre?": vPierreConfigOverrides,
  "shiki?": vShikiConfigOverrides,
})
export const vCliConfigOverrides = type({
  "pierre?": vCliPierreConfig.partial(),
  "shiki?": vCliShikiConfig.partial(),
})

type PierreKey = keyof typeof PIERRE_CONFIG_FIELDS
type ShikiKey = keyof typeof SHIKI_CONFIG_FIELDS

const TOP_LEVEL_KEYS = ["pierre", "shiki"] as const
const PIERRE_KEYS = Object.keys(PIERRE_CONFIG_FIELDS)
const SHIKI_KEYS = Object.keys(SHIKI_CONFIG_FIELDS)

export type SuisekiConfig = typeof vSuisekiConfig.infer
export type SuisekiConfigOverrides = typeof vSuisekiConfigOverrides.infer

type DraftSuisekiConfigOverrides = {
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
    "word-diff": "word-alt",
    "max-line-diff-length": 1000,
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
  configuration: SuisekiConfigOverrides
  path: string
}

type LoadConfigParams = {
  currentWorkingDirectory?: string
  overrides?: SuisekiConfigOverrides
}

export async function loadConfig({
  currentWorkingDirectory = process.cwd(),
  overrides = {},
}: LoadConfigParams = {}): Promise<SuisekiConfig> {
  const loadedUserConfigFile = await loadFirstUserConfigFile()
  const loadedRepositoryConfigFile = await loadRepositoryConfigFile({
    currentWorkingDirectory,
  })
  const userConfiguration = loadedUserConfigFile?.configuration ?? {}
  const repositoryConfiguration =
    loadedRepositoryConfigFile?.configuration ?? {}
  const environmentOverrides = readEnvironmentOverrides()

  const mergedConfiguration = {
    pierre: {
      ...DEFAULT_CONFIG.pierre,
      ...(userConfiguration.pierre ?? {}),
      ...(repositoryConfiguration.pierre ?? {}),
      ...(environmentOverrides.pierre ?? {}),
      ...(overrides.pierre ?? {}),
    },
    shiki: {
      ...DEFAULT_CONFIG.shiki,
      ...(userConfiguration.shiki ?? {}),
      ...(repositoryConfiguration.shiki ?? {}),
      ...(environmentOverrides.shiki ?? {}),
      ...(overrides.shiki ?? {}),
    },
  }
  const configurationSources = [
    loadedUserConfigFile?.path,
    loadedRepositoryConfigFile?.path,
    hasConfigOverrides(overrides) ? "CLI overrides" : undefined,
  ].filter((source) => source != null)

  return validateConfig(
    mergedConfiguration,
    configurationSources.length > 0
      ? configurationSources.join(", ")
      : "defaults",
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

async function loadFirstUserConfigFile(): Promise<
  LoadedConfigFile | undefined
> {
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

type LoadRepositoryConfigFileParams = {
  currentWorkingDirectory: string
}

async function loadRepositoryConfigFile({
  currentWorkingDirectory,
}: LoadRepositoryConfigFileParams): Promise<LoadedConfigFile | undefined> {
  for (const configFilePath of getRepositoryConfigFileCandidates(
    currentWorkingDirectory,
  )) {
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

function getRepositoryConfigFileCandidates(
  currentWorkingDirectory: string,
): string[] {
  const configFileCandidates: string[] = []
  let directory = resolve(currentWorkingDirectory)

  while (true) {
    configFileCandidates.push(join(directory, ".suiseki.toml"))

    const parentDirectory = dirname(directory)
    if (parentDirectory === directory) {
      return configFileCandidates
    }

    directory = parentDirectory
  }
}

function parseConfigFile(
  fileText: string,
  configFilePath: string,
): SuisekiConfigOverrides {
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

  return validateConfigOverrides(parsedConfig, configFilePath)
}

function readEnvironmentOverrides(): SuisekiConfigOverrides {
  const environmentOverrides: DraftSuisekiConfigOverrides = {}

  const pierreOverrides = readPierreEnvironmentOverrides()
  if (Object.keys(pierreOverrides).length > 0) {
    environmentOverrides.pierre = pierreOverrides
  }

  const shikiOverrides = readShikiEnvironmentOverrides()
  if (Object.keys(shikiOverrides).length > 0) {
    environmentOverrides.shiki = shikiOverrides
  }

  return validateConfigOverrides(environmentOverrides, "environment")
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

  if (
    Bun.env.SUISEKI_PIERRE_WORD_DIFF != null &&
    Bun.env.SUISEKI_PIERRE_WORD_DIFF !== ""
  ) {
    overrides["word-diff"] = Bun.env.SUISEKI_PIERRE_WORD_DIFF
  }

  if (
    Bun.env.SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH != null &&
    Bun.env.SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH !== ""
  ) {
    overrides["max-line-diff-length"] = parseEnvironmentPositiveInteger({
      name: "SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH",
      value: Bun.env.SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH,
    })
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
    overrides["max-line-length"] = parseEnvironmentPositiveInteger({
      name: "SUISEKI_SHIKI_MAX_LINE_LENGTH",
      value: Bun.env.SUISEKI_SHIKI_MAX_LINE_LENGTH,
    })
  }

  return overrides
}

type ParseEnvironmentBooleanParams = {
  name: string
  value: string
}

export function parseEnvironmentBoolean({
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

type ParseEnvironmentPositiveIntegerParams = {
  name: string
  value: string
}

function parseEnvironmentPositiveInteger({
  name,
  value,
}: ParseEnvironmentPositiveIntegerParams): number {
  const parsedValue = vPositiveIntegerString(value)

  if (parsedValue instanceof type.errors) {
    throw new ConfigError(`${name} ${parsedValue.summary}`)
  }

  return parsedValue
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

function validateConfigOverrides(
  configuration: unknown,
  source: string,
): SuisekiConfigOverrides {
  const validatedConfiguration = vSuisekiConfigOverrides(configuration)

  if (validatedConfiguration instanceof type.errors) {
    throw new ConfigError(
      `Invalid suiseki configuration from ${source}: ${validatedConfiguration.summary}`,
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
): asserts value is SuisekiConfigOverrides {
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

function hasConfigOverrides(overrides: SuisekiConfigOverrides): boolean {
  return (
    Object.keys(overrides.pierre ?? {}).length > 0 ||
    Object.keys(overrides.shiki ?? {}).length > 0
  )
}
