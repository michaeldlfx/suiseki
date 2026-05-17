# suiseki — PLAN.md

> **Repo:** `<your-handle>/suiseki` &nbsp;·&nbsp; **Binary / command:** `suiseki` &nbsp;·&nbsp; **Config dir:** `~/.suiseki/` &nbsp;·&nbsp; **Env prefix:** `SUISEKI_*` &nbsp;·&nbsp; **License:** Apache 2.0

## Pitch

A modern terminal renderer for code, built on Pierre's parsing logic and Shiki's syntax/theme system. Phases:

- [ ] **v0** — unified-view diff renderer that works locally. Couple of hours.
- [ ] **v1** — proper `delta` alternative. Split view, inline word diff, themes, pager integration, binaries on GH Releases. Real release.
- [ ] **v2** — expand beyond diffs to file viewing (`cat`/`bat` alternative - maybe we suggest aliasing as `sat` (s for `suiseki`, at to mirrow `cat`/`bat`)? or provide that out of the box?) and static tree printing. "Pierre's renderer, in your terminal."

**Why this niche is open:** `delta` (Rust + syntect) uses dated Sublime grammars and a fixed theme set. `difftastic` is AST-based and barely themes. Shiki has thousands of themes and best-in-class TextMate grammar support, but no diff-aware CLI uses it. Pierre's parsing and tree logic is Apache 2.0, battle-tested, and renderer-agnostic at the module level, and Pierre already builds around Shiki for syntax and theming. `suiseki` is the friendly terminal surface for those pieces.

## Progress tracking

Use this file as the durable cross-session source of truth.

- At the start of each work session, review the unchecked items in the current phase before implementing.
- When work completes, check the relevant Markdown item in the same change set as the implementation, tests, and docs.
- Commit completed work with the checkbox update included. Do not make a code-only commit for completed roadmap work.
- Treat checked boxes as committed progress, not merely local working-tree progress.
- Do not check an item for partial progress. Add or split sub-checkboxes if a task needs smaller tracking units.
- Keep the parent phase unchecked until all of its child items are implemented, verified, and committed.
- If a plan item changes scope, update the unchecked text before implementing rather than checking an obsolete item.
- For handoff across sessions, leave the next unchecked item obvious and avoid relying on chat history.

## The name

**Pierre** is French for *stone*. The library powering this tool — `@pierre/diffs` — is the work of The Pierre Computer Company.

**水石 / suiseki** is the Japanese art of stone appreciation — a contemplative practice, imported from Chinese scholar's-rock tradition and refined in Japan, of viewing naturally-formed stones for their beauty: finding landscapes, figures, and quiet meaning in their shape. The literal reading is *water-stone* — stones polished and revealed by water over time.

The name is a homage. *Pierre → stone → 水石*. The tool exists to do, for code, what suiseki does for stones: take something rough and naturally-occurring — the raw output of `git diff`, the unformatted text of a source file — polish it, and reveal the form underneath. Made to be looked at.

The relationship to Pierre and Shiki should stay friendly and explicit: this is not a fork, rewrite, or replacement. It is a terminal companion for `@pierre/diffs`, `@pierre/trees`, and Shiki-compatible themes, using their renderer-agnostic model layers where they fit and giving them a Unix-style CLI surface.

This naming text belongs at the top of the published README. See [v1 § README polish](#readme-polish).

## Stack (constant across versions)

- **Bun** + TypeScript, single-binary output via `bun build --compile`
- **Arktype** for runtime validation of config, CLI option objects, and external data boundaries
- **Shiki** (`codeToTokensBase`) for syntax tokenization and Shiki-compatible theming, both directly and through Pierre's theme-oriented packages
- **`@pierre/diffs`** (`parsePatchFiles`, `iterateOverDiff`) for diff parsing/iteration — imported from the main entry, tree-shaken to drop DOM code
- **`@pierre/trees`** model layer (v2 only) for static tree printing
- **`ansis`** for ANSI escape generation
- **`smol-toml`** for config parsing
- **Biome** for formatting and linting, wired through `bun check` / `bun format`
- **Apache 2.0** license (symmetric with Pierre, friendly with patent grant)

**Explicitly no Go tooling.** Stay in the JS/Bun ecosystem end-to-end.

## Core architecture

```
input source (git, stdin, file path)
       │
       ▼
parser (parsePatchFiles for diffs, raw read for files)
       │
       ▼
iterator (iterateOverDiff for diffs, line walker for files)
       │
       ▼
per-line tokenize (Shiki codeToTokensBase)
       │
       ▼
emit ANSI per token (\x1b[38;2;<fg>;48;2;<bg>m<content>\x1b[0m)
       │                  bg = diff-state for diffs, none for plain files
       ▼
prepend gutter (line number + optional sign + optional tree column)
       │
       ▼
stdout (Unix filter — write once, exit)
```

### Invariants across all versions

1. **Tokenize, don't `codeToANSI`.** Use `codeToTokensBase` and emit ANSI by hand. Reason: syntax-fg + diff-bg in the **same escape per token**, otherwise mid-line resets create background holes.
2. **Trust tree-shaking on `@pierre/*` packages.** They mark only web-components files as side-effecting. Bun should drop the DOM code when we import only parsing/model utils. Vendoring is the fallback, not the starting point.
3. **Unix filter discipline.** Read input, write ANSI to stdout, exit. No raw mode, no event loop, no keyboard handling. The moment we'd need those, it's a different product.
4. **No file modification.** Read-only tool. Always.
5. **No service-style logging by default.** `stdout` is the rendered product and must stay clean for pipes, pagers, and git integration. In v0, do not add `pino` or `pino-pretty`; write normal diagnostics and errors to `stderr`, and gate debug output behind an explicit flag or env var such as `--verbose` / `SUISEKI_DEBUG`. Reconsider structured logging in v1 only if there is a concrete need for `--log-format json`, issue-report diagnostics, or traceable config/git resolution.
6. **Shiki-native theming.** Treat Shiki themes as the color source of truth. Do not invent a separate theme schema unless the terminal needs a small overlay for diff backgrounds, gutters, or inline-diff emphasis. Custom themes should be valid Shiki themes.

## File layout

```
suiseki/                  # local dev dir; GitHub repo is <handle>/suiseki-cli
├── makefile
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE              # Apache 2.0
├── NOTICE               # credits Pierre + Shiki
├── plans/
│   └── 00-building-suiseki.md
├── src/
│   ├── cli.ts           # entry — v0: linear; v1: arg parsing; v2: subcommand router
│   ├── config.ts        # TOML loading + resolution order
│   ├── render/
│   │   ├── diff.ts       # v0+: diff pipeline
│   │   ├── diff.test.ts  # colocated Bun tests
│   │   ├── file.ts       # v2+: plain file pipeline
│   │   ├── file.test.ts  # v2
│   │   ├── tree.ts       # v2+: static tree pipeline
│   │   └── tree.test.ts  # v2
│   ├── ansi.ts          # token → ANSI emit with optional bg overlay
│   ├── gutter.ts        # line numbers, signs, side columns
│   └── types.ts
├── bin/
│   └── suiseki          # gitignored local dev binary from `make build`
└── dist/                # gitignored release artifacts from multi-target builds
```

### Naming convention

| Place                       | Value                       |
|-----------------------------|-----------------------------|
| GitHub repo                 | `suiseki-cli`               |
| Local project dir (any)     | `suiseki/` (convention)     |
| Binary / command            | `suiseki`                   |
| Homebrew formula (own tap)  | `suiseki`                   |
| package.json `name`         | `suiseki-cli` (if ever published to npm), with `bin: { suiseki: "..." }` |
| Config dir                  | `~/.suiseki/` (and XDG: `$XDG_CONFIG_HOME/suiseki/`) |
| Per-repo config             | `.suiseki.toml`             |
| Env var prefix              | `SUISEKI_*` (e.g. `SUISEKI_SHIKI_THEME`, `SUISEKI_PIERRE_VIEW`, `SUISEKI_CONFIG_DIR`) |

---

# v0 — local unified-view diff renderer

**Goal:** unified-view diff with syntax highlighting + diff bg colors prints to terminal. Snapshot test passes. Single binary works. Takes a couple of hours.

### v0 progress checklist

- [x] Commit the baseline scaffold: Bun/TypeScript project, `make` commands, `src/cli.ts`, README, AGENTS, and this plan.
- [x] Install renderer dependencies: `@pierre/diffs`, Shiki, `ansis`, and `smol-toml`.
- [x] Confirm `@pierre/diffs` parser imports cleanly in Bun and compiled binaries without DOM globals; vendor non-public `iterateOverDiff`.
- [x] Confirm `iterateOverDiff` callback shape against the Pierre source before building renderer logic around it.
- [x] Implement CLI input selection: stdin patch input or `git diff` subprocess output.
- [x] Support Git pager mode so `core.pager = suiseki` can render normal `git diff`, `git show`, and related commands without manual piping.
- [x] Implement config loading with `smol-toml`, Arktype validation, environment overrides, and built-in defaults.
- [x] Map Pierre and Shiki options into explicit `suiseki` config keys without arbitrary passthrough.
- [x] Implement unified diff rendering with file headers, hunk headers, Shiki token colors, and diff backgrounds.
- [x] Implement ANSI emission with foreground/background composition, font styles, line padding, and reset safety.
- [x] Implement gutters with line numbers, change signs, and stable width calculation.
- [x] Add colocated Bun tests for the basic unified diff renderer.
- [x] Build `bin/suiseki`, run it against a real diff, and keep the compiled binary size under the sanity-check threshold.

### v0 polish — align with Pierre's diffs.com rendering

Remaining rendering gaps to close before v0 feels right. These should be addressed in order:

- [x] **Blank line between files.** Add a visual separator (empty line) between the end of one file's diff and the next file's header.
- [x] **File header color.** Changed from blue (`#79b8ff`) to neutral white (`#e1e4e8`), matching Pierre's default foreground.
- [x] **File status icon in header.** Uses `file.type` from Pierre's `ChangeTypes`: `Δ` change, `+` new, `-` deleted, `→` renamed. Color-coded per status.
- [x] **Path vs filename display.** Directory dimmed (`#8b949e`), filename bold white (`#e1e4e8`). Renames show both paths with `→` separator.
- [x] **Pager support.** Spawns `less -R --no-init --quit-if-one-screen` when stdout is a TTY. `--no-pager` flag or `SUISEKI_NO_PAGER=1` to disable.

### 1. Scaffold

```bash
mkdir suiseki && cd suiseki
git init
bun init -y
bun add @pierre/diffs shiki ansis smol-toml arktype
bun add -d @types/bun @biomejs/biome typescript
```

Add to `package.json`:
```json
{
  "name": "suiseki-cli",
  "bin": { "suiseki": "./src/cli.ts" },
  "scripts": {
    "dev": "bun run src/cli.ts",
    "test": "bun test --pass-with-no-tests",
    "build": "mkdir -p bin && bun build src/cli.ts --compile --outfile bin/suiseki",
    "start": "./bin/suiseki",
    "clean": "rm -rf bin dist",
    "format": "biome format --write .",
    "check": "tsc --noEmit && biome check --write .",
    "check:ci": "biome ci ."
  }
}
```

### 2. CLI entry (`src/cli.ts`)

- If `process.stdin.isTTY === false`: read stdin to end → that's the patch
- Otherwise: `Bun.spawn(['git', 'diff', ...process.argv.slice(2)])`, capture stdout
- Hand patch text to `renderDiff()` from `src/render/diff.ts`
- Write result to stdout

Git integration requirement: `suiseki` should work as `core.pager`, not only as `git diff | suiseki`. When Git invokes a pager, Git sends already-generated diff text to the pager's stdin. Treat that as the primary path. Direct `suiseki HEAD~1 HEAD` usage is a convenience wrapper around `git diff`.

### 3. Config loader (`src/config.ts`)

Resolution order (highest → lowest):
1. CLI flags *(skip in v0)*
2. Env vars (`SUISEKI_SHIKI_THEME`, `SUISEKI_PIERRE_VIEW`, etc.)
3. `$SUISEKI_CONFIG_DIR/config.toml`
4. `$XDG_CONFIG_HOME/suiseki/config.toml` (defaulting to `~/.config/suiseki/`)
5. `~/.suiseki/config.toml`
6. Built-in defaults

Parse with `smol-toml`. Keep config loading read-only in line with the project invariant: do not create or modify config files on first run. A future explicit `suiseki init` command may write a commented default config if the read-only CLI scope is intentionally expanded for that command.

Default config:
```toml
[pierre]
view = "unified"             # unified | split (split=v1)
line-numbers = true
change-indicator = "sign"    # sign | bar | background
diff-background = true       # colored backgrounds on changed lines
file-header = true           # show file header
hunk-header = "none"         # none | full (none matches Pierre's default)

[shiki]
theme = "github-dark"        # any Shiki bundled theme
max-line-length = 10000      # skip syntax highlighting for lines longer than this
```

Config schema rule: every config key lives under `[pierre]` or `[shiki]` — suiseki does not invent its own options but exposes Pierre and Shiki options through explicit, validated, namespaced keys. No arbitrary passthrough: unknown TOML keys are rejected, and every supported key is validated with Arktype. Keys should be overridable by a CLI flag in v1 and documented in the README config reference. Env var convention: `SUISEKI_PIERRE_<KEY>` and `SUISEKI_SHIKI_<KEY>`.

Theming rule: `shiki.theme` should resolve to a Shiki bundled theme, a custom Shiki JSON theme, or a Pierre-provided Shiki theme such as a future `@pierre/theme` import. Diff backgrounds and gutters are terminal overlays layered around Shiki token colors, not a replacement theme system.

### 4. Render pipeline (`src/render/diff.ts`)

```ts
import { parsePatchFiles, iterateOverDiff } from '@pierre/diffs'
import { codeToTokensBase, getSingletonHighlighter } from 'shiki'
import { emitLine, emitFileHeader, emitHunkHeader } from '../ansi'

export async function renderDiff(patch: string, config: Config): Promise<string> {
  const parsed = parsePatchFiles(patch)
  const highlighter = await getSingletonHighlighter({ themes: [config.theme] })
  const out: string[] = []

  for (const file of parsed.files) {
    out.push(emitFileHeader(file))
    for (const hunk of file.hunks) {
      out.push(emitHunkHeader(hunk))
    }
    iterateOverDiff(file, (line) => {
      out.push(emitLine(line, highlighter, config))
    })
  }
  return out.join('\n')
}
```

> **First-session task:** confirm the exact shape of `iterateOverDiff`'s callback. The type def (`DiffLineCallbackProps`) has `additionLine` / `deletionLine` / `type` — verify the signature against `packages/diffs/src/utils/iterateOverDiff.ts` in the cloned Pierre repo before going deep.

### 5. ANSI emit (`src/ansi.ts`)

```ts
import { FontStyle } from '@shikijs/vscode-textmate'

function hex2rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const fg = (hex: string) => { const [r,g,b] = hex2rgb(hex); return `\x1b[38;2;${r};${g};${b}m` }
const bg = (hex: string) => { const [r,g,b] = hex2rgb(hex); return `\x1b[48;2;${r};${g};${b}m` }
const RESET = '\x1b[0m'

export function emitToken(token: ThemedToken, diffBg?: string): string {
  let out = ''
  out += fg(token.color || '#ffffff')
  if (diffBg) out += bg(diffBg)
  if (token.fontStyle && (token.fontStyle & FontStyle.Bold)) out += '\x1b[1m'
  if (token.fontStyle && (token.fontStyle & FontStyle.Italic)) out += '\x1b[3m'
  if (token.fontStyle && (token.fontStyle & FontStyle.Underline)) out += '\x1b[4m'
  out += token.content
  out += RESET
  return out
}
```

Diff-bg palette (v0 hardcoded, configurable in v1):
- addition: `#0e2e0e` (subtle dark green)
- deletion: `#2e0e0e` (subtle dark red)
- context: undefined (no bg)

Pad each line to terminal width with `bg` applied so the highlight extends to edge, then `RESET`.

### 6. Gutter (`src/gutter.ts`)

Prepend to each rendered line:
```
  <line-number>  <sign>  <content>
```
Sign is `+` / `-` / ` `. Line number padded to width of largest line number in file. Sign-colored (green/red/dim) so it stays legible even if bg colors are disabled.

### 7. Tests (`src/render/diff.test.ts`)

```ts
import { test, expect } from 'bun:test'
import { renderDiff } from './diff'

const patch = `diff --git a/src/example.ts b/src/example.ts
...`

test('renders basic unified diff', async () => {
  const out = await renderDiff(patch, { theme: 'github-dark', view: 'unified', 'line-numbers': true, 'change-indicator': 'sign' })
  expect(out).toContain('\x1b[48;2;14;46;14m')
})
```

Keep small renderer fixtures inline in colocated tests. Add fixture files only when the input becomes too large to read clearly in the test body.

Run: `bun test`.

### 8. Try locally

```bash
cd ~/work/lyra
bun /path/to/suiseki/src/cli.ts HEAD~1 HEAD
# or as a pipe:
git diff | bun /path/to/suiseki/src/cli.ts
```

### 9. Compile binary

```bash
cd /path/to/suiseki
bun run build
./bin/suiseki HEAD~1 HEAD
```

### v0 sanity checks (first 10 minutes)

- [x] `parsePatchFiles` from `@pierre/diffs` resolves without crashing on a `document`/`window` reference at module load.
- [x] Local compiled binary `bin/suiseki` stays under ~80 MB after tree-shaking. If much larger, vendor `parsePatchFiles.ts` + `iterateOverDiff.ts` + `types.ts` from the Pierre repo into `vendored/pierre/` with the Apache LICENSE preserved.
- [x] Confirm `iterateOverDiff` signature against the Pierre repo's `src/utils/iterateOverDiff.ts`

### Source references

Keep sibling checkouts of Pierre at `../pierre` and Shiki at `../shiki` during development and treat them as read-only reference material. These are useful for checking API surfaces, type definitions, and theme implementations. The canonical source for the callback contract is:

```text
../pierre/packages/diffs/src/utils/iterateOverDiff.ts
```

As of `@pierre/diffs@1.1.22`, the top-level package import exposes `parsePatchFiles` but does not expose `iterateOverDiff`, and the package `exports` map blocks direct imports from `dist/utils/iterateOverDiff.js`. For v0, verify the callback shape against the sibling source checkout, then either walk Pierre's parsed hunk model locally or vendor the small renderer-agnostic utility with the Apache license preserved. Do not build renderer logic around private package subpaths.

### Pierre and Shiki option mapping

Every config key lives under `[pierre]` or `[shiki]`. Suiseki does not claim Pierre or Shiki options as its own — it exposes them honestly under their respective namespaces.

#### `[pierre]` diff keys

| Pierre option | Suiseki key | Notes |
|---|---|---|
| `BaseDiffOptions.diffStyle` | `pierre.view` | `"unified"` / `"split"` |
| `BaseDiffOptions.diffIndicators` | `pierre.change-indicator` | `classic→sign`, `bars→bar`, `none→background` |
| `BaseCodeOptions.disableLineNumbers` | `pierre.line-numbers` | Inverted boolean |
| `BaseDiffOptions.disableBackground` | `pierre.diff-background` | Inverted boolean, controls line bg colors |
| `BaseCodeOptions.disableFileHeader` | `pierre.file-header` | Inverted boolean |
| `BaseDiffOptions.hunkSeparators` | `pierre.hunk-header` | Simplified to `"full"` / `"none"` |
| `lineDiffType` | `pierre.word-diff` | `"word-alt"` / `"word"` / `"char"` / `"none"` |
| `maxLineDiffLength` | `pierre.max-line-diff-length` | Performance guard for word diff |

#### `[shiki]` keys (v0)

| Shiki option | Suiseki key | Notes |
|---|---|---|
| `theme` parameter | `shiki.theme` | Bundled Shiki theme name |
| `tokenizeMaxLineLength` | `shiki.max-line-length` | Performance guard; falls back to plaintext |

#### Rejected options (incompatible with Unix filter model)

| Option | Reason |
|---|---|
| `overflow` | Terminal handles wrapping natively |
| `preferredHighlighter` | Always shiki-js via Bun |
| `useCSSClasses` | DOM-specific |
| `useTokenTransformer` | DOM-specific |
| `unsafeCSS` | DOM-specific |
| `collapsed` | Interactive UI state |
| `disableVirtualizationBuffers` | DOM virtualization |
| `collapsedContextThreshold` | Full-file expansion setting; `git diff` patch context belongs to Git's `-U<n>` option |
| `expandUnchanged` | Full-file expansion setting; not meaningful for pre-rendered patch streams |
| `expansionLineCount` | Interactive expansion |
| `parseDiffOptions` | Internal jsdiff tuning |
| `themeType` | CSS/system theme switching; terminal output uses one explicit Shiki theme |

Tree options stay deferred to v2, when `@pierre/trees` becomes a dependency.

---

# v1 — real delta alternative

**Goal:** something a stranger could actually adopt. Properly themed, fully featured for diffs, published with prebuilt binaries.

### Features

In rough order of value:

- [x] **Split-view layout** — pair old/new lines using `iterateOverDiff`'s split metadata, columnize to terminal width. Handle line wrapping within columns.
- [x] **Inline word/char diff** — `diff` npm package's `diffWordsWithSpace` / `diffChars` on changed line pairs, overlay extra ANSI highlight (brighter bg) on changed tokens.
- [x] **Per-repo `.suiseki.toml`** — walk up from cwd to find. Merged on top of user config. The killer feature delta lacks: a monorepo can specify "split view + word-level for `apps/`, unified for `docs/`".
- [x] **CLI flags** — override any config key from the command line (`--view split`, `--theme catppuccin-mocha`, etc.). Uses a small local parser so unknown arguments still pass through to `git diff`.
- [x] **Default usage on empty invocation** — when `suiseki` runs with no stdin and no git diff arguments, print concise usage/setup guidance instead of silently exiting on an empty working tree.
- [x] **Pierre terminal-surface mapping** — inventory Pierre's public diff/tree options and expose terminal-relevant, renderer-agnostic diff options through typed config keys and matching CLI flags. Tree options stay v2-only until `@pierre/trees` is added.
- [x] **Pager auto-spawn** — when stdout is a TTY, spawn `less -R --no-init --quit-if-one-screen`. `--no-pager` flag or `SUISEKI_NO_PAGER=1` env to disable. (Landed in v0 polish.)
- [x] **Git integration docs** in README. Shipped per-command pager settings (`pager.diff`, `pager.show`) instead of `core.pager` so that plain `git log` keeps Git's normal pager output. README also documents `interactive.diffFilter` and the equivalent `~/.gitconfig` snippet. Suiseki reads its own TOML config, not git config, so no `[suiseki]` section appears in the .gitconfig example.
- [x] **Custom theme loading** — read `~/.suiseki/themes/*.json` (also `$SUISEKI_CONFIG_DIR/themes/` and `$XDG_CONFIG_HOME/suiseki/themes/`) as Shiki themes, name resolved from filename. Each file is parsed with `string.json.parse` then validated against `vCustomTheme` (Arktype) before being registered with the highlighter. Invalid files are skipped with a stderr warning.
- [x] **Pierre theme pack** — bundle `@pierre/theme`'s Shiki themes as built-ins. All four variants available: `pierre-dark`, `pierre-light`, `pierre-dark-vibrant`, `pierre-light-vibrant`. Registered with the Shiki highlighter at init.
- [x] **Merge conflict rendering** — auto-detects `<<<<<<<` markers in input and renders via Pierre's `parseMergeConflictDiffFromFile` (vendored, 1208 lines of edge-case handling). Current side renders as deletions, incoming as additions, base section (diff3) as context. Markers themselves are stripped from output. Works in unified and split views.
- [x] **`--no-color` / `NO_COLOR` env support** — standard hygiene. `--no-color` flag plus `NO_COLOR` env var (any non-empty value) strip ANSI from rendered output.
- **Tests** — fixtures for:
  - [x] split view
  - [x] inline word/char diff
  - [x] merge conflicts

### README polish

Required content for the published README, in order:

- [ ] **Title + tagline** — "suiseki — a terminal renderer for diffs and code"
- [ ] **The naming homage paragraph** from the [§ The name](#the-name) section above. Copy verbatim.
- [ ] **Screenshot or asciinema cast** of a real diff
- [ ] **30-second pitch** — what it does, who it's for
- [ ] **Install** — Homebrew, install script, prebuilt binary download
- [ ] **Quick start** — basic usage, common flags
- [ ] **Git integration** — the per-command pager (`pager.diff`, `pager.show`) + `interactive.diffFilter` snippet
- [ ] **Comparison table** vs `delta` / `difftastic` / `diff-so-fancy` — be honest, note what each does better
- [ ] **Config reference** — every key documented, with example `~/.suiseki/config.toml`
- [ ] **Themes** — small gallery showing a few popular Shiki themes plus the Pierre theme variants applied to the same diff
- [ ] **Credits** — `@pierre/diffs` (Apache 2.0, with a link), Shiki (MIT), the Pierre Computer Company

Release engineering for v1 (binaries, GH Releases, Homebrew, install script) is tracked in [`01-publishing-suiseki.md`](./01-publishing-suiseki.md). Start that plan once these v1 features and the README polish are complete.

---

# v2 — Pierre's renderer for the terminal

v2 work — `view`, `tree`, and the subcommand router — lives in [`02-extending-suiseki.md`](./02-extending-suiseki.md). Start that plan once v1 has shipped.

---

# Out of scope (don't build, don't promise)

These come up naturally as ideas but each one is a fork in the architecture, a different product, or a different rabbit hole:

- **Interactive folder explorer** (like `broot`, `yazi`, `lf`). Requires terminal raw mode, keyboard event loop, redraw cycles, focus/state management. Different product.
- **Markdown rendering** (glow alternative). No help from Pierre or Shiki for non-code markdown elements (headers, lists, tables, blockquotes, links). Would be ~1500+ LOC of its own, separate AST walker. Different rabbit hole.
- **Editing / writing files.** Read-only tool, always.
- **Git operations** beyond invoking `git diff`. Not a git client.
- **LSP / language server integration.** Not an editor.
- **Web/HTTP interface.** Terminal-only.
- **Go-based dependencies** (charmbracelet libs etc.). Stay in TS/Bun.

If any of these would be valuable, they're separate projects with their own repos.
