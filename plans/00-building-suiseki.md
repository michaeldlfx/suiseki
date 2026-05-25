# suiseki — PLAN.md

> **Repo:** `<your-handle>/suiseki` &nbsp;·&nbsp; **Binary / command:** `suiseki` &nbsp;·&nbsp; **Config dir:** `~/.suiseki/` &nbsp;·&nbsp; **Env prefix:** `SUISEKI_*` &nbsp;·&nbsp; **License:** Apache 2.0

## Pitch

A modern terminal renderer for code, built on Pierre's parsing logic and Shiki's syntax/theme system. Phases:

- [x] **v0** — unified-view diff renderer that works locally. Couple of hours.
- [x] **v1** — practical terminal diff renderer. Split view, inline word diff, themes, pager integration, binaries on GH Releases. Real release. *(features and release engineering shipped: v0.1.x on GH Releases, Homebrew, install script, `suiseki upgrade`, smoke-tested binaries. Public-facing README polish — screenshots, theme gallery, launch presentation — tracked in `03-making-suiseki-public.md`, which rides on top of v1 and does not gate it.)*
- [x] **v2** — expand beyond diffs to file viewing and static tree printing, shipped as `suiseki view` and the `sat` symlink (s for `suiseki`, `at` to mirror `cat`/`bat`), with the `--with-tree` sidebar. "Pierre's renderer, in your terminal." *(tracked in `02-extending-suiseki.md`. The `--color-only` interactive diff filter graduated to `04-color-only-diff-filter.md` as a separate post-v2 enhancement.)*

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
- The roadmap spans five files: `00-building-suiseki.md` (this file — v0/v1 features, project-wide architecture and out-of-scope), `01-publishing-suiseki.md` (v1 perf pass + release engineering: binaries, GH Releases, Homebrew, install script, npm decision), `02-extending-suiseki.md` (v2 work — `view`, `tree`, subcommand router, v2 README update), `03-making-suiseki-public.md` (public-facing README polish + launch presentation: screenshots, theme gallery, install docs), and `04-color-only-diff-filter.md` (the interactive `--color-only` diff filter, a post-v2 enhancement). Treat each file as the authoritative checklist for its own scope.
- When working in `01-` or `02-`, edit those files for the in-progress checkboxes, **and** when you complete a milestone that satisfies a high-level phase bullet at the top of this file (the v0/v1/v2 list in [§ Pitch](#pitch)), come back here to check it off in the same commit. v1 stays unchecked until all v1 features and `01-publishing-suiseki.md` are done. The public launch polish in `03-making-suiseki-public.md` rides on top of v1 and depends on `01` shipping installable binaries first. v2 stays unchecked until `02-extending-suiseki.md` is done.

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
│   ├── 00-building-suiseki.md       # this file: v0/v1 features, architecture
│   ├── 01-publishing-suiseki.md     # v1 perf pass + release engineering
│   ├── 02-extending-suiseki.md      # v2 work (view, tree, subcommand router)
│   └── 03-making-suiseki-public.md  # public-facing README polish + launch
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

#### `[shiki]` keys

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

# v1 — practical terminal diff renderer

**Goal:** something a stranger could actually adopt. Properly themed, fully featured for diffs, published with prebuilt binaries.

### Features

In rough order of value:

- [x] **Split-view layout** — pair old/new lines using `iterateOverDiff`'s split metadata, columnize to terminal width. Handle line wrapping within columns.
- [x] **Inline word/char diff** — `diff` npm package's `diffWordsWithSpace` / `diffChars` on changed line pairs, overlay extra ANSI highlight (brighter bg) on changed tokens.
- [x] **Per-repo `.suiseki.toml`** — walk up from cwd to find. Merged on top of user config. Lets a monorepo specify "split view + word-level for `apps/`, unified for `docs/`".
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

Core README content shipped during the build. These are done and live in `README.md` today:

- [x] **Title + tagline** — "suiseki — a terminal renderer for diffs and code"
- [x] **The naming homage paragraph** from the [§ The name](#the-name) section above. Copy verbatim.
- [x] **30-second pitch** — what it does, who it's for. (Currently lives in the README Status section; expand if needed once binaries ship.)
- [x] **Quick start** — basic usage, common flags
- [x] **Git integration** — the per-command pager (`pager.diff`, `pager.show`) + `interactive.diffFilter` snippet
- [x] **Config reference** — every key documented, with example `~/.suiseki/config.toml`
- [x] **Credits** — `@pierre/diffs` (Apache 2.0, with a link), Shiki (MIT), the Pierre Computer Company

The remaining README work is public-facing launch presentation — install docs, a screenshot, a theme gallery, and an optional peer comparison. It wants the final release binary and shipped themes to exist first, so it moved to [`03-making-suiseki-public.md`](./03-making-suiseki-public.md).

Release engineering for v1 (binaries, GH Releases, Homebrew, install script) is tracked in [`01-publishing-suiseki.md`](./01-publishing-suiseki.md). The v1 features are complete, so that plan can start now.

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
