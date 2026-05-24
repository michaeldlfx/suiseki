import { DEFAULT_CONFIG } from "./config"

function tomlValue(value: string | number | boolean): string {
  return typeof value === "string" ? `"${value}"` : String(value)
}

const p = DEFAULT_CONFIG.pierre
const s = DEFAULT_CONFIG.shiki

export function generateAnnotatedConfig(): string {
  return [
    "# suiseki configuration reference",
    "# Place this file at one of:",
    "#   $SUISEKI_CONFIG_DIR/config.toml         (if SUISEKI_CONFIG_DIR is set)",
    "#   $XDG_CONFIG_HOME/suiseki/config.toml    (default: ~/.config/suiseki/config.toml)",
    "#   ~/.suiseki/config.toml",
    "#   .suiseki.toml                            (per-repo, searched up from cwd)",
    "#",
    "# CLI flags and SUISEKI_* env vars override all file values.",
    "# All options below are also available as CLI flags; run `suiseki --help` for the full list.",
    "# Run `suiseki themes` for the full list of available themes.",
    "",
    "[pierre]",
    "",
    "# Layout for displaying diffs.",
    '# values: "unified" | "split"',
    "# env:    SUISEKI_PIERRE_VIEW",
    `view = ${tomlValue(p.view)}`,
    "",
    "# Show line numbers in the gutter.",
    "# values: true | false",
    "# env:    SUISEKI_PIERRE_LINE_NUMBERS",
    `line-numbers = ${tomlValue(p["line-numbers"])}`,
    "",
    "# Style used to mark changed lines.",
    '# values: "sign" | "bar" | "background"',
    "# env:    SUISEKI_PIERRE_CHANGE_INDICATOR",
    `change-indicator = ${tomlValue(p["change-indicator"])}`,
    "",
    "# Tint diff lines with a background color.",
    "# values: true | false",
    "# env:    SUISEKI_PIERRE_DIFF_BACKGROUND",
    `diff-background = ${tomlValue(p["diff-background"])}`,
    "",
    "# Show the file path header above each changed file.",
    "# values: true | false",
    "# env:    SUISEKI_PIERRE_FILE_HEADER",
    `file-header = ${tomlValue(p["file-header"])}`,
    "",
    "# How much of the hunk context line to show.",
    '# values: "none" | "full"',
    "# env:    SUISEKI_PIERRE_HUNK_HEADER",
    `hunk-header = ${tomlValue(p["hunk-header"])}`,
    "",
    "# Word-level diff highlighting within changed lines.",
    '# values: "word-alt" | "word" | "char" | "none"',
    "# env:    SUISEKI_PIERRE_WORD_DIFF",
    `word-diff = ${tomlValue(p["word-diff"])}`,
    "",
    "# Skip word-diff on lines longer than this (performance guard).",
    "# values: positive integer",
    "# env:    SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH",
    `max-line-diff-length = ${tomlValue(p["max-line-diff-length"])}`,
    "",
    "[shiki]",
    "",
    "# Syntax highlighting theme.",
    "# Pierre themes: pierre-dark, pierre-light, pierre-dark-vibrant, pierre-light-vibrant",
    "# Also accepts any Shiki bundled theme (e.g. github-dark, nord, dracula).",
    "# Run `suiseki themes` for the full list.",
    "# values: string",
    "# env:    SUISEKI_SHIKI_THEME",
    `theme = ${tomlValue(s.theme)}`,
    "",
    "# Skip syntax tokenization on lines longer than this (performance guard).",
    "# values: positive integer",
    "# env:    SUISEKI_SHIKI_MAX_LINE_LENGTH",
    `max-line-length = ${tomlValue(s["max-line-length"])}`,
  ].join("\n")
}

export async function runConfigCommand(): Promise<void> {
  process.stdout.write(`${generateAnnotatedConfig()}\n`)
}
