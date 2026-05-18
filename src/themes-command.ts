import { bundledThemes } from "shiki"
import {
  ConfigError,
  DEFAULT_CONFIG,
  isBundledThemeName,
  loadConfig,
} from "./config"
import { type CustomThemes, loadCustomThemes } from "./custom-themes"
import { isPierreThemeName, PIERRE_THEMES } from "./pierre-themes"

export async function runThemesCommand(): Promise<void> {
  const customThemes = await loadCustomThemes()
  const selectedThemeName = await resolveSelectedThemeName()

  const sections: string[] = []
  sections.push(
    ...renderThemeSection("Shiki bundled", Object.keys(bundledThemes)),
  )
  sections.push("")
  sections.push(...renderThemeSection("Pierre", Object.keys(PIERRE_THEMES)))
  sections.push("")
  sections.push(...renderThemeSection("Custom", Object.keys(customThemes)))
  sections.push(
    "  (searched: $SUISEKI_CONFIG_DIR/themes, $XDG_CONFIG_HOME/suiseki/themes, ~/.suiseki/themes)",
  )
  sections.push("")
  sections.push(formatSelectedTheme(selectedThemeName, customThemes))
  sections.push(
    "Set via shiki.theme in config, SUISEKI_SHIKI_THEME env, or --theme <name>.",
  )

  process.stdout.write(`${sections.join("\n")}\n`)
}

async function resolveSelectedThemeName(): Promise<string> {
  try {
    const configuration = await loadConfig()
    return configuration.shiki.theme
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    return Bun.env.SUISEKI_SHIKI_THEME ?? DEFAULT_CONFIG.shiki.theme
  }
}

function formatSelectedTheme(
  themeName: string,
  customThemes: CustomThemes,
): string {
  const isValid =
    isBundledThemeName(themeName) ||
    isPierreThemeName(themeName) ||
    Object.hasOwn(customThemes, themeName)

  const display = isValid ? themeName : `<invalid: ${themeName}>`
  return `Currently selected: ${display}`
}

function renderThemeSection(label: string, names: string[]): string[] {
  const sorted = [...names].sort()
  const header = `${label} (${sorted.length}):`
  if (sorted.length === 0) {
    return [header, "  (none)"]
  }
  return [header, ...sorted.map((name) => `  ${name}`)]
}
