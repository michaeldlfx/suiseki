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
│   │   ├── diff.ts      # v0+: diff pipeline
│   │   ├── file.ts      # v2+: plain file pipeline
│   │   └── tree.ts      # v2+: static tree pipeline
│   ├── ansi.ts          # token → ANSI emit with optional bg overlay
│   ├── gutter.ts        # line numbers, signs, side columns
│   └── types.ts
├── test/
│   ├── render-diff.test.ts
│   ├── render-file.test.ts     # v2
│   ├── render-tree.test.ts     # v2
│   └── fixtures/
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
| Env var prefix              | `SUISEKI_*` (e.g. `SUISEKI_THEME`, `SUISEKI_CONFIG_DIR`) |

---

# v0 — local unified-view diff renderer

**Goal:** unified-view diff with syntax highlighting + diff bg colors prints to terminal. Snapshot test passes. Single binary works. Takes a couple of hours.

### v0 progress checklist

- [ ] Commit the baseline scaffold: Bun/TypeScript project, `make` commands, `src/cli.ts`, README, AGENTS, and this plan.
- [ ] Install renderer dependencies: `@pierre/diffs`, Shiki, `ansis`, and `smol-toml`.
- [ ] Confirm `@pierre/diffs` imports cleanly in Bun and compiled binaries without DOM globals.
- [ ] Confirm `iterateOverDiff` callback shape against the Pierre source before building renderer logic around it.
- [ ] Implement CLI input selection: stdin patch input or `git diff` subprocess output.
- [ ] Support Git pager mode so `core.pager = suiseki` can render normal `git diff`, `git show`, and related commands without manual piping.
- [ ] Implement config loading with `smol-toml`, Arktype validation, environment overrides, and built-in defaults.
- [ ] Map Pierre and Shiki options into explicit `suiseki` config keys without arbitrary passthrough.
- [ ] Implement unified diff rendering with file headers, hunk headers, Shiki token colors, and diff backgrounds.
- [ ] Implement ANSI emission with foreground/background composition, font styles, line padding, and reset safety.
- [ ] Implement gutters with line numbers, change signs, and stable width calculation.
- [ ] Add fixtures and Bun tests for the basic unified diff renderer.
- [ ] Build `bin/suiseki`, run it against a real diff, and keep the compiled binary size under the sanity-check threshold.

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
2. Env vars (`SUISEKI_THEME`, `SUISEKI_VIEW`, etc.)
3. `$SUISEKI_CONFIG_DIR/config.toml`
4. `$XDG_CONFIG_HOME/suiseki/config.toml` (defaulting to `~/.config/suiseki/`)
5. `~/.suiseki/config.toml`
6. Built-in defaults

Parse with `smol-toml`. On first run when nothing exists, write a commented default `config.toml` to the resolved dir (XDG path preferred).

Default config:
```toml
theme = "github-dark"        # any Shiki bundled theme
view = "unified"             # unified | split (split=v1)
line-numbers = true
change-indicator = "sign"    # sign | bar | background
```

Config schema rule: support config and CLI flags through explicit, typed keys, not arbitrary passthrough. The config should cover `suiseki` renderer behavior (`theme`, `view`, gutters, pager, color mode, inline diff, wrapping) and should also expose Pierre-derived options where they are renderer-agnostic and useful in a terminal. Before implementing config deeply, map Pierre's public flags/options into a friendly terminal surface and classify each one:

1. **First-class `suiseki` key** — core user-facing behavior, such as theme, view mode, line numbers, merge conflict rendering, or filetype detection.
2. **Namespaced Pierre surface key** — useful lower-level Pierre behavior that should remain identifiable as Pierre-derived, likely under `[pierre]`.
3. **Rejected** — DOM, web-component, interactive, or UI-state behavior that conflicts with the Unix-filter model.

Every supported key must be validated with Arktype, documented in the README config reference, and overridable by a CLI flag in v1. Do not silently forward unknown TOML keys into Pierre APIs.

Theming rule: `theme` should resolve to a Shiki bundled theme, a custom Shiki JSON theme, or a Pierre-provided Shiki theme such as a future `@pierre/theme` import. Diff backgrounds and gutters are terminal overlays layered around Shiki token colors, not a replacement theme system.

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

### 7. Tests (`test/render-diff.test.ts`)

```ts
import { test, expect } from 'bun:test'
import { renderDiff } from '../src/render/diff'
import { readFileSync } from 'fs'

test('renders basic unified diff', async () => {
  const patch = readFileSync('test/fixtures/basic.diff', 'utf8')
  const out = await renderDiff(patch, { theme: 'github-dark', view: 'unified', 'line-numbers': true, 'change-indicator': 'sign' })
  expect(out).toMatchSnapshot()
})
```

Generate fixture: `cd ~/some-repo && git diff HEAD~1 HEAD > test/fixtures/basic.diff`.

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

- [ ] `import { parsePatchFiles, iterateOverDiff } from '@pierre/diffs'` resolves without crashing on a `document`/`window` reference at module load
- [ ] Local compiled binary `bin/suiseki` stays under ~80 MB after tree-shaking. If much larger, vendor `parsePatchFiles.ts` + `iterateOverDiff.ts` + `types.ts` from the Pierre repo into `vendored/pierre/` with the Apache LICENSE preserved.
- [ ] Confirm `iterateOverDiff` signature against the Pierre repo's `src/utils/iterateOverDiff.ts`

---

# v1 — real delta alternative

**Goal:** something a stranger could actually adopt. Properly themed, fully featured for diffs, published with prebuilt binaries.

### Features

In rough order of value:

- [ ] **Split-view layout** — pair old/new lines using `iterateOverDiff`'s split metadata, columnize to terminal width. Handle line wrapping within columns.
- [ ] **Inline word/char diff** — `diff` npm package's `diffWords` / `diffChars` on changed line pairs, overlay extra ANSI highlight (brighter bg) on changed tokens.
- [ ] **Per-repo `.suiseki.toml`** — walk up from cwd to find. Merged on top of user config. The killer feature delta lacks: a monorepo can specify "split view + word-level for `apps/`, unified for `docs/`".
- [ ] **CLI flags** — override any config key from the command line (`--view split`, `--theme catppuccin-mocha`, etc.). Use `cac` or `citty` for parsing (TS-native, light).
- [ ] **Pierre terminal-surface mapping** — inventory Pierre's public diff/tree options and expose the renderer-agnostic ones through typed config keys and matching CLI flags.
- [ ] **Pager auto-spawn** — detect non-TTY stdout, spawn `less -R --no-init` automatically. `--no-pager` to disable.
- [ ] **Streaming for huge diffs** — switch from `parsePatchFiles` (whole-buffer) to `@pierre/diffs`'s `shiki-stream` tokenizer for diffs over N lines. Memory stays bounded.
- [ ] **Git integration docs** in README:
   ```bash
   git config --global core.pager 'suiseki'
   git config --global interactive.diffFilter 'suiseki --color-only'
   ```
  Also document equivalent `.gitconfig` shape:
  ```gitconfig
  [core]
    pager = suiseki

  [suiseki]
    line-numbers = true
    view = split
    theme = github-dark
  ```
- [ ] **Custom theme loading** — read `~/.suiseki/themes/*.json` as Shiki themes, name resolved from filename.
- [ ] **Pierre theme pack** — bundle `@pierre/theme`'s Shiki themes (`pierre-dark`, `pierre-light`) as built-ins.
- [ ] **Merge conflict rendering** — use `parseMergeConflictDiffFromFile` from Pierre. 1208 lines of edge-case handling delta doesn't have. Differentiator.
- [ ] **`--no-color` / `NO_COLOR` env support** — standard hygiene.
- [ ] **Tests** — fixtures for split view, inline diff, merge conflicts, large patches.

### Publishing

- [ ] Primary distribution: prebuilt binaries via GitHub Releases (Linux x64/arm64, macOS x64/arm64, Windows x64).
- [ ] GitHub Actions on tag runs `bun test`, builds each target, and uploads binaries to the release.
- [ ] Install script detects platform, fetches the latest binary, and installs to `/usr/local/bin/`.
- [ ] Homebrew tap ships a `suiseki.rb` formula.
- [ ] npm publish decision is made post-v1. If done, name is `suiseki-cli` or scoped `@<handle>/suiseki` with `bin: { suiseki: "..." }`; otherwise squat the name with a placeholder package pointing to the binaries.

### Release target policy

Local development builds write only `bin/suiseki`. Release builds write named artifacts under `dist/`.

Bun supports cross-compiling standalone executables with `bun build --compile --target=...`, so the first release workflow should try a cross-build matrix before adding per-platform build runners. Do not add GitHub Actions workflows until v1 release work starts.

Initial release targets:

- [ ] `bun-darwin-arm64` → `dist/suiseki-darwin-arm64`
- [ ] `bun-darwin-x64` → `dist/suiseki-darwin-x64`
- [ ] `bun-linux-x64-baseline` → `dist/suiseki-linux-x64`
- [ ] `bun-linux-arm64` → `dist/suiseki-linux-arm64`
- [ ] `bun-linux-x64-musl` → `dist/suiseki-linux-x64-musl`
- [ ] `bun-linux-arm64-musl` → `dist/suiseki-linux-arm64-musl`
- [ ] `bun-windows-x64` → `dist/suiseki-windows-x64.exe`
- [ ] `bun-windows-arm64` → `dist/suiseki-windows-arm64.exe`

Release validation:

- [ ] First pass: prove each target compiles and upload artifacts with checksums.
- [ ] Later pass: smoke-test native artifacts on matching GitHub Actions runners where practical.
- [ ] Minimal smoke test: `suiseki --version`, `suiseki --help`, and a tiny fixture diff piped through stdin.
- [ ] If cross-built artifacts fail native smoke tests, split release jobs by runner OS/architecture instead of forcing a single-machine cross-build.
- [ ] Keep Linux x64 on the baseline target unless size/perf tradeoffs justify a separate modern build. Broader CPU compatibility matters more than marginal speed for a diff renderer.

### README polish

Required content for the published README, in order:

- [ ] **Title + tagline** — "suiseki — a terminal renderer for diffs and code"
- [ ] **The naming homage paragraph** from the [§ The name](#the-name) section above. Copy verbatim.
- [ ] **Screenshot or asciinema cast** of a real diff
- [ ] **30-second pitch** — what it does, who it's for
- [ ] **Install** — Homebrew, install script, prebuilt binary download
- [ ] **Quick start** — basic usage, common flags
- [ ] **Git integration** — the `core.pager` / `interactive.diffFilter` snippet
- [ ] **Comparison table** vs `delta` / `difftastic` / `diff-so-fancy` — be honest, note what each does better
- [ ] **Config reference** — every key documented, with example `~/.suiseki/config.toml`
- [ ] **Themes** — small gallery showing a few popular Shiki themes applied to the same diff
- [ ] **Credits** — `@pierre/diffs` (Apache 2.0, with a link), Shiki (MIT), the Pierre Computer Company

### Upstream-to-Pierre proposal

- [ ] After v1 ships and there's something concrete to point at, file an issue on `pierrecomputer/pierre`:

> **Proposal: extract `@pierre/diff-core` — renderer-agnostic parsing + iteration**
>
> I've built a terminal diff renderer (link to suiseki-cli) using `@pierre/diffs`' parsing utilities, importing them from the main entry and tree-shaking the DOM code at bundle time. It works, but a renderer-agnostic `@pierre/diff-core` package would be cleaner — `@pierre/diffs` and `PierreDiffsSwift` (and now suiseki) all consume those utilities independent of the renderer. Happy to draft the PR.

Outcome doesn't block anything. Even if they decline, v1 ships fine.

---

# v2 — Pierre's renderer for the terminal

**Goal:** the tool stops being just a diff renderer. It becomes the general "view code in the terminal" tool — diffs, files, and static trees. The name `suiseki` (the art of viewing stones) already covers this expanded identity; no rename needed.

### Features

- [ ] **Subcommand router in `src/cli.ts`** — replace v1's flat arg parsing with subcommand dispatch:
   ```
   suiseki diff [git-args]       # current v1 behavior
   suiseki view <file>           # syntax-highlighted file (bat-alternative)
   suiseki tree [path]           # static tree print, Pierre-styled
   suiseki                       # smart default: if cwd is a git repo with changes,
                                 # show `diff` of working tree; else show `tree .`
   ```
   Each subcommand inherits global flags (`--theme`, `--no-color`, `--no-pager`).

- [ ] **`view` subcommand (`src/render/file.ts`)** — bat alternative:
   - Read file from path
   - Detect language from extension (use Pierre's `getFiletypeFromFileName` util)
   - Tokenize with Shiki, emit ANSI with line numbers, no diff bg
   - Show file header (filename, language detected, size)
   - Same pager/color/theme rules as `diff`
   - **Architecture**: 90% reused from v0's diff pipeline minus the diff overlay. ~150 LOC of new code.

- [ ] **`tree` subcommand (`src/render/tree.ts`)** — `tree` command alternative, Pierre-styled:
   - Use `@pierre/trees` model layer (`FileTreeController`, path helpers, `gitStatus`) — vendor or import similar to `@pierre/diffs`
   - Walk filesystem from given path (`readdir` via Bun)
   - Optionally annotate with git status (M/A/D/?? prefixes)
   - Print using Pierre's icon set + tree-drawing characters (`├── `, `└── `, `│   `)
   - Honor `.gitignore` by default; `--all` flag overrides
   - **Architecture**: still a Unix filter. Print once, exit. No interaction.

- [ ] **`suiseki view --with-tree`** — side-by-side static print: file content on the right, tree on the left, current file path highlighted in the tree. Within terminal width; falls back to file-only if width < 100 cols. ~50 extra LOC over the basic `view` command.

- [ ] **Update README** to reflect the broader identity. New comparison: vs `bat`, vs `tree`, vs `eza`, in addition to vs `delta`. The naming paragraph already supports this — suiseki is the *art of viewing*, not just diff viewing.

- [ ] **Tests for each subcommand**.

### v2 sanity checks

- [ ] Confirm `@pierre/trees` model imports cleanly without DOM globals (same check as v0 did for `@pierre/diffs`)
- [ ] Default behavior (`suiseki` with no args) feels right in practice — try both "in a dirty repo" and "in a clean directory"

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
