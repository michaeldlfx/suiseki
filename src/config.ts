import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { type } from "arktype"
import { type BundledTheme, bundledThemes } from "shiki"
import { parse } from "smol-toml"
import { vStringBoolean } from "./common/validators"
import { type CustomThemes, loadCustomThemes } from "./custom-themes"
import { isPierreThemeName } from "./pierre-themes"

const vPositiveInteger = type("number.integer > 0")
const vPositiveIntegerString = type("string.numeric.parse").to(vPositiveInteger)

const vSuisekiEnv = type({
  "SUISEKI_PIERRE_VIEW?": '"unified" | "split"',
  "SUISEKI_PIERRE_LINE_NUMBERS?": vStringBoolean,
  "SUISEKI_PIERRE_CHANGE_INDICATOR?": '"sign" | "bar" | "background"',
  "SUISEKI_PIERRE_DIFF_BACKGROUND?": vStringBoolean,
  "SUISEKI_PIERRE_FILE_HEADER?": vStringBoolean,
  "SUISEKI_PIERRE_HUNK_HEADER?": '"full" | "none"',
  "SUISEKI_PIERRE_WORD_DIFF?": '"word-alt" | "word" | "char" | "none"',
  "SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH?": vPositiveIntegerString,
  "SUISEKI_SHIKI_THEME?": "string",
  "SUISEKI_SHIKI_MAX_LINE_LENGTH?": vPositiveIntegerString,
  "SUISEKI_SHIKI_MAX_FILE_LINES?": vPositiveIntegerString,
  "SUISEKI_VIEW_WITH_TREE?": vStringBoolean,
  "SUISEKI_VIEW_WITH_TREE_SIDE?": '"left" | "right"',
  "SUISEKI_NO_PAGER?": vStringBoolean,
})

export type SuisekiEnv = typeof vSuisekiEnv.infer

export function readSuisekiEnv(): SuisekiEnv {
  // Drop undefined/empty values so optional schema keys treat them as absent
  // rather than as present-but-wrong-type. Bun.env preserves keys set to
  // undefined, and arktype's `?` is strict about that distinction.
  const definedEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(Bun.env)) {
    if (value == null || value === "") continue
    definedEnv[key] = value
  }

  const parsedEnv = vSuisekiEnv(definedEnv)
  if (parsedEnv instanceof type.errors) {
    throw new ConfigError(parsedEnv.summary)
  }
  return parsedEnv
}

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
  "max-file-lines": vPositiveInteger,
} as const

// suiseki's own (non-Pierre, non-Shiki) view options. `with-tree` defaults the
// `view`/`sat` file viewer to the side-by-side tree layout; `with-tree-side`
// chooses which side the tree sits on.
const VIEW_CONFIG_FIELDS = {
  "with-tree": "boolean",
  "with-tree-side": '"left" | "right"',
} as const

const CLI_PIERRE_CONFIG_FIELDS = {
  ...PIERRE_CONFIG_FIELDS,
  "max-line-diff-length": vPositiveIntegerString,
} as const

const CLI_SHIKI_CONFIG_FIELDS = {
  ...SHIKI_CONFIG_FIELDS,
  "max-line-length": vPositiveIntegerString,
  "max-file-lines": vPositiveIntegerString,
} as const

export const vPierreConfig = type(PIERRE_CONFIG_FIELDS)
export const vShikiConfig = type(SHIKI_CONFIG_FIELDS)
export const vViewConfig = type(VIEW_CONFIG_FIELDS)
export const vCliPierreConfig = type(CLI_PIERRE_CONFIG_FIELDS)
export const vCliShikiConfig = type(CLI_SHIKI_CONFIG_FIELDS)

export const vSuisekiConfig = type({
  pierre: vPierreConfig,
  shiki: vShikiConfig,
  view: vViewConfig,
})

export const vPierreConfigOverrides = vPierreConfig.partial()
export const vShikiConfigOverrides = vShikiConfig.partial()
export const vViewConfigOverrides = vViewConfig.partial()
export const vSuisekiConfigOverrides = type({
  "pierre?": vPierreConfigOverrides,
  "shiki?": vShikiConfigOverrides,
  "view?": vViewConfigOverrides,
})
export const vCliConfigOverrides = type({
  "pierre?": vCliPierreConfig.partial(),
  "shiki?": vCliShikiConfig.partial(),
})

type PierreKey = keyof typeof PIERRE_CONFIG_FIELDS
type ShikiKey = keyof typeof SHIKI_CONFIG_FIELDS
type ViewKey = keyof typeof VIEW_CONFIG_FIELDS

const TOP_LEVEL_KEYS = ["pierre", "shiki", "view"] as const
const PIERRE_KEYS = Object.keys(PIERRE_CONFIG_FIELDS)
const SHIKI_KEYS = Object.keys(SHIKI_CONFIG_FIELDS)
const VIEW_KEYS = Object.keys(VIEW_CONFIG_FIELDS)

export type SuisekiConfig = typeof vSuisekiConfig.infer & {
  customThemes: CustomThemes
}
export type SuisekiConfigOverrides = typeof vSuisekiConfigOverrides.infer

type DraftSuisekiConfigOverrides = {
  pierre?: Partial<Record<PierreKey, unknown>>
  shiki?: Partial<Record<ShikiKey, unknown>>
  view?: Partial<Record<ViewKey, unknown>>
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
    theme: "pierre-dark",
    "max-line-length": 10000,
    "max-file-lines": 10000,
  },
  view: {
    "with-tree": false,
    "with-tree-side": "left",
  },
  customThemes: {},
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
  suisekiEnv?: SuisekiEnv
}

export async function loadConfig({
  currentWorkingDirectory = process.cwd(),
  overrides = {},
  suisekiEnv = readSuisekiEnv(),
}: LoadConfigParams = {}): Promise<SuisekiConfig> {
  const loadedUserConfigFile = await loadFirstUserConfigFile()
  const loadedRepositoryConfigFile = await loadRepositoryConfigFile({
    currentWorkingDirectory,
  })
  const userConfiguration = loadedUserConfigFile?.configuration ?? {}
  const repositoryConfiguration =
    loadedRepositoryConfigFile?.configuration ?? {}
  const environmentOverrides = environmentOverridesFrom(suisekiEnv)

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
    view: {
      ...DEFAULT_CONFIG.view,
      ...(userConfiguration.view ?? {}),
      ...(repositoryConfiguration.view ?? {}),
      ...(environmentOverrides.view ?? {}),
      ...(overrides.view ?? {}),
    },
  }
  const configurationSources = [
    loadedUserConfigFile?.path,
    loadedRepositoryConfigFile?.path,
    hasConfigOverrides(overrides) ? "CLI overrides" : undefined,
  ].filter((source) => source != null)

  const customThemes = await loadCustomThemes()

  return validateConfig({
    configuration: mergedConfiguration,
    customThemes,
    source:
      configurationSources.length > 0
        ? configurationSources.join(", ")
        : "defaults",
  })
}

export function getConfigFileCandidates(): string[] {
  const homeDirectory =
    Bun.env.HOME != null && Bun.env.HOME !== "" ? Bun.env.HOME : homedir()
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

function environmentOverridesFrom(env: SuisekiEnv): SuisekiConfigOverrides {
  const pierre: Partial<Record<PierreKey, unknown>> = {}
  if (env.SUISEKI_PIERRE_VIEW !== undefined) {
    pierre.view = env.SUISEKI_PIERRE_VIEW
  }
  if (env.SUISEKI_PIERRE_LINE_NUMBERS !== undefined) {
    pierre["line-numbers"] = env.SUISEKI_PIERRE_LINE_NUMBERS
  }
  if (env.SUISEKI_PIERRE_CHANGE_INDICATOR !== undefined) {
    pierre["change-indicator"] = env.SUISEKI_PIERRE_CHANGE_INDICATOR
  }
  if (env.SUISEKI_PIERRE_DIFF_BACKGROUND !== undefined) {
    pierre["diff-background"] = env.SUISEKI_PIERRE_DIFF_BACKGROUND
  }
  if (env.SUISEKI_PIERRE_FILE_HEADER !== undefined) {
    pierre["file-header"] = env.SUISEKI_PIERRE_FILE_HEADER
  }
  if (env.SUISEKI_PIERRE_HUNK_HEADER !== undefined) {
    pierre["hunk-header"] = env.SUISEKI_PIERRE_HUNK_HEADER
  }
  if (env.SUISEKI_PIERRE_WORD_DIFF !== undefined) {
    pierre["word-diff"] = env.SUISEKI_PIERRE_WORD_DIFF
  }
  if (env.SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH !== undefined) {
    pierre["max-line-diff-length"] = env.SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH
  }

  const shiki: Partial<Record<ShikiKey, unknown>> = {}
  if (env.SUISEKI_SHIKI_THEME !== undefined) {
    shiki.theme = env.SUISEKI_SHIKI_THEME
  }
  if (env.SUISEKI_SHIKI_MAX_LINE_LENGTH !== undefined) {
    shiki["max-line-length"] = env.SUISEKI_SHIKI_MAX_LINE_LENGTH
  }
  if (env.SUISEKI_SHIKI_MAX_FILE_LINES !== undefined) {
    shiki["max-file-lines"] = env.SUISEKI_SHIKI_MAX_FILE_LINES
  }

  const view: Partial<Record<ViewKey, unknown>> = {}
  if (env.SUISEKI_VIEW_WITH_TREE !== undefined) {
    view["with-tree"] = env.SUISEKI_VIEW_WITH_TREE
  }
  if (env.SUISEKI_VIEW_WITH_TREE_SIDE !== undefined) {
    view["with-tree-side"] = env.SUISEKI_VIEW_WITH_TREE_SIDE
  }

  const overrides: DraftSuisekiConfigOverrides = {}
  if (Object.keys(pierre).length > 0) overrides.pierre = pierre
  if (Object.keys(shiki).length > 0) overrides.shiki = shiki
  if (Object.keys(view).length > 0) overrides.view = view

  return validateConfigOverrides(overrides, "environment")
}

type ValidateConfigParams = {
  configuration: unknown
  customThemes: CustomThemes
  source: string
}

function validateConfig({
  configuration,
  customThemes,
  source,
}: ValidateConfigParams): SuisekiConfig {
  const validatedConfiguration = vSuisekiConfig(configuration)

  if (validatedConfiguration instanceof type.errors) {
    throw new ConfigError(
      `Invalid suiseki configuration from ${source}: ${validatedConfiguration.summary}`,
    )
  }

  if (
    !isSupportedThemeName({
      themeName: validatedConfiguration.shiki.theme,
      customThemes,
    })
  ) {
    throw new ConfigError(
      `Invalid suiseki configuration from ${source}: shiki.theme must be a bundled Shiki theme, a Pierre theme, or a custom theme loaded from ~/.suiseki/themes/`,
    )
  }

  return { ...validatedConfiguration, customThemes }
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

type IsSupportedThemeNameParams = {
  customThemes: CustomThemes
  themeName: string
}

export function isSupportedThemeName({
  customThemes,
  themeName,
}: IsSupportedThemeNameParams): boolean {
  return (
    isBundledThemeName(themeName) ||
    isPierreThemeName(themeName) ||
    Object.hasOwn(customThemes, themeName)
  )
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

  if (value.view != null) {
    assertPlainObject(value.view, `${configFilePath} [view]`)
    assertKnownKeysInSet(
      Object.keys(value.view),
      VIEW_KEYS,
      `${configFilePath} [view]`,
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
    Object.keys(overrides.shiki ?? {}).length > 0 ||
    Object.keys(overrides.view ?? {}).length > 0
  )
}
