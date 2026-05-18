import { bundledThemes } from "shiki"
import { loadConfig } from "./config"
import { PIERRE_THEMES } from "./pierre-themes"

export async function runThemesCommand(): Promise<void> {
  const configuration = await loadConfig()

  const sections: string[] = []
  sections.push(
    ...renderThemeSection("Shiki bundled", Object.keys(bundledThemes)),
  )
  sections.push("")
  sections.push(...renderThemeSection("Pierre", Object.keys(PIERRE_THEMES)))
  sections.push("")
  sections.push(
    ...renderThemeSection("Custom", Object.keys(configuration.customThemes)),
  )
  sections.push(
    "  (searched: $SUISEKI_CONFIG_DIR/themes, $XDG_CONFIG_HOME/suiseki/themes, ~/.suiseki/themes)",
  )
  sections.push("")
  sections.push(`Currently selected: ${configuration.shiki.theme}`)
  sections.push(
    "Set via shiki.theme in config, SUISEKI_SHIKI_THEME env, or --theme <name>.",
  )

  process.stdout.write(`${sections.join("\n")}\n`)
}

function renderThemeSection(label: string, names: string[]): string[] {
  const sorted = [...names].sort()
  const header = `${label} (${sorted.length}):`
  if (sorted.length === 0) {
    return [header, "  (none)"]
  }
  return [header, ...sorted.map((name) => `  ${name}`)]
}
