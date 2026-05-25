# suiseki — extending beyond diffs (v2): `sat`, a file + tree viewer

> Companion plan to [`00-building-suiseki.md`](./00-building-suiseki.md) (features, README) and [`01-publishing-suiseki.md`](./01-publishing-suiseki.md) (release engineering). Start this plan once v1 has shipped to GitHub Releases.

**Goal:** the tool stops being just a diff renderer. It becomes the general "view code in the terminal" tool — diffs, files, and static trees. The name `suiseki` (the art of viewing stones) already covers this expanded identity; no rename needed.

This pass builds **`sat`** — a `cat`/`bat`-style terminal file viewer (with an optional tree), built on suiseki's existing render pipeline and on the renderer-agnostic model of Pierre's [`@pierre/trees`](https://trees.software/). `sat` = `s` (suiseki) + `at` (mirroring `cat`/`bat`).

## Build decisions (resolved)

- **Command shape — subcommands, plus a `sat` symlink via argv0 dispatch.** Canonical commands are `suiseki view <file>` and `suiseki tree [path]` (the v2 subcommand router). To make `sat` ergonomic, the single compiled binary inspects its own invocation name (busybox-style): when invoked as `sat`, it routes to the viewer instead of the diff path. `sat <file>` ≡ `suiseki view <file>`; `sat <dir>` / `sat` with no path ≡ `suiseki tree <dir|.>`; `sat -` / piped stdin ≡ view stdin as a file. `make setup` creates the `sat` symlink next to `bin/suiseki` on PATH. This resolves the "a symlink can't invoke a subcommand" wrinkle without a second binary to build/release/brew.
  - **Sanity spike (done):** in a `bun build --compile` binary, `process.argv[0]` is `"bun"`, `argv[1]` is the internal `/$bunfs/root/...` name, and `process.execPath` is the symlink-*resolved* real target — none reflect the `sat` symlink. But **`process.argv0` preserves the invocation name** (`./sat` → `"./sat"`, PATH lookup → `"sat"`). So dispatch keys on `basename(process.argv0) === "sat"`.
- **Scope — file viewer and tree together** (this pass), then the `--with-tree` sidebar.
- **Trees integration — vendor the renderer-agnostic bits, do not depend on `@pierre/trees`.** Verified: `@pierre/trees@1.0.0-beta.3` declares `preact` + `preact-render-to-string` as hard dependencies and imports `@pierre/path-store` via `workspace:*` (not resolvable from npm). Its `FileTreeController` (2063 lines) is interactive-UI machinery, and its icon system is **SVG sprites** (`SVGSpriteNames`, `spriteSheet`, `viewBox`) that cannot render in a terminal. So we vendor only the small, clean, renderer-agnostic pieces (sort order, path helpers) into `src/vendor/pierre/`, mirroring how v0 vendored `iterate-over-diff`. Contrast: `@pierre/diffs` was safe to depend on because react is a *peer* dep (uninstalled) and its DOM code is tree-shaken behind `sideEffects`; trees is not in that shape.

### Honest corrections to the original v2 sketch

- **"Use Pierre's icon set" → not possible in a terminal.** Pierre's icons are SVG `<symbol>` sprites for the DOM. The terminal needs font glyphs. What makes our tree "Pierre-styled" is the **sort order** (`defaultChildrenComparator`: folders-before-files, dot-prefixed-first, case-insensitive alpha) plus tree-drawing characters — not the icons. Icon strategy below.
- **"Use the `@pierre/trees` model layer (`FileTreeController`, …)" → vendor a tiny subset instead.** We build a small static tree ourselves and borrow only sort + path helpers + the git-status label/rollup concept.

## Architecture: reuse the diff pipeline

A file viewer is ~90% the diff pipeline minus the diff overlay. Plan of record:

- [x] **Extract shared render primitives into `src/render/highlight.ts`** (no behavior change; diff tests stay green). Move out of `src/render/diff.ts`:
  - `prepareDiffRenderContext` → rename `prepareRenderContext`; type `DiffRenderContext` → `RenderContext` (`{ highlighter, palette, terminalWidth, themeName }`). Update all importers (`diff.ts`, `diff.test.ts`, merge-conflict).
  - `tokenizeLine`, `renderTokenizedContent` (+ `renderTokenWithInlineHighlights`, `sliceInlineHighlightRanges`), `resolveLanguageForFile`, `isBundledLanguageName`, `resolveTheme`, `getTerminalWidth`, `stripLineEnding`.
  - `diff.ts` imports these back; merge-conflict + diff behavior unchanged.
- Reused as-is: `renderGutter` (gutter.ts; `marker: " "` for a clean line-number gutter), `emitStyledText` / `emitToken` / `emitPadding` / `RESET` / `stripAnsi` (ansi.ts), `getFiletypeFromFileName` (`@pierre/diffs`), the theme/palette/pager/`--no-color`/`--no-pager` machinery.

## Features

- [x] **Subcommand router + argv0 dispatch in `src/cli.ts`.** Routing (**`view` is polymorphic** — file → content, directory → tree; there is **no separate `tree` verb**):
  ```
  suiseki [git-args]            # unchanged: diff of working tree / git pager
  suiseki view <file>           # syntax-highlighted file (cat/bat alternative)
  suiseki view <dir>            # directory tree (tree/eza alternative)
  suiseki view -                # read file content from stdin
  sat <file|dir|->              # ≡ suiseki view (argv0 dispatch via symlink)
  sat                           # no path: tree cwd on a TTY, else read stdin
  ```
  Decisions reached during build: **no `tree` subcommand** — `suiseki view <dir>` / `sat <dir>` tree a directory, so a separate verb was redundant. **`view` is not redundant with bare `suiseki`** because `suiseki <arg>` is already `git diff <arg>` (revisions/paths/`--staged`), so `suiseki foo.ts` means "diff foo.ts"; `view`/`sat` is the unambiguous "show content/tree" verb. The classification (file/dir/stdin/missing) lives in `src/view-target.ts` (pure, unit-tested). Keep existing `themes` / `config` / `upgrade` subcommands. The "smart default" for bare `suiseki` (dirty repo → diff, else tree) stays **deferred**; bare `suiseki` keeps today's behavior.

- [x] **`view` subcommand — `src/render/file.ts`** (bat alternative):
  - Resolve input: file path argument, or stdin when piped / when arg is `-`.
  - Guard: missing file → clear stderr error + non-zero exit; directory argument → suggest `tree`; binary file (NUL byte sniff) → print a `<binary file>` notice rather than garbage.
  - Detect language via `getFiletypeFromFileName` (reuse `resolveLanguageForFile`).
  - File header (honors `pierre.file-header`): path (dir dimmed, filename bold), detected language, byte size.
  - Per line: `renderGutter` (line number, `marker: " "`, honoring `pierre.line-numbers`) + `renderTokenizedContent` (no background, empty inline ranges). No diff overlay.
  - Large-file fallback: above `shiki.max-file-lines`, tokenize as `plaintext` (mirror diff). Above `shiki.max-line-length`, per-line plaintext fallback (already in `tokenizeLine`).
  - Stream line blocks (`streamFileLines`) with stdout backpressure (reuse the diff EPIPE pattern) so `sat huge.log | head` stops early; pager/`--no-color` rules identical to diff.
  - **~150 LOC of new code** on top of the shared module.

- [x] **Directory tree rendering — `src/render/tree.ts`** (reached via `view <dir>` / `sat <dir>`; `tree`/`eza` alternative, Pierre-sorted):
  - Enumerate paths from the given root (default cwd):
    - Inside a git repo: `git ls-files --cached --others --exclude-standard` for correct, free `.gitignore` semantics (no reimplementation). `--all` adds ignored/`.git` via a plain walk.
    - Outside a repo: filesystem walk (`readdir` recursive), skipping `.git`; `--all` shows dotfiles too.
  - Build the nested structure from the flat path list using vendored `path-helpers` + `sort-children` (`defaultChildrenComparator`) so ordering matches Pierre.
  - Render with tree-drawing chars (`├── `, `└── `, `│   `, `    `); directories styled with `palette.accent` + trailing `/`, files `palette.foreground`.
  - **Icons — `▾ ` before directories** (user-confirmed), a BMP glyph that renders in any monospace font (no Nerd Font / tofu). Directories also get a trailing `/` + accent color; files are plain. `--no-icons` disables; a richer per-filetype Nerd Font set is deferred behind an opt-in.
  - **Git status — on by default inside a git repo.** Prefix a colored status column from `git status --porcelain` (labels `A`/`M`/`D`/`R`/`??` informed by Pierre's `GIT_STATUS_LABEL`), rolled up to ancestor directories (Pierre's `directoriesWithChanges` concept). `--no-git-status` disables; absent outside a repo.
  - Static print, exit. No interaction, no raw mode (Unix-filter invariant holds).

- [x] **`view --with-tree <file>` / `sat -t <file>`** (`src/render/with-tree.ts`) — side-by-side: directory tree on the left, file contents on the right, current file highlighted. **Reveal layout** (user-chosen): root at the project (repo root, or cwd; a file outside falls back to its own dir), expand only the file's ancestor directories (`▾`) and collapse the rest (`▸`). Tree column fixed-width; file column truncated by visible width (`fitToWidth` in ansi.ts) so long lines never wrap into the tree. Falls back to the plain view below 100 cols or for stdin.

- [x] **Vendored Pierre bits — `src/vendor/pierre/`** (Apache license already present in that dir):
  - `sort-children.ts` ← `packages/trees/src/utils/sortChildren.ts` (`defaultChildrenComparator` semantics, reduced to a `{ name, isDirectory }` comparator; dropped the `f::` flattened-path handling we don't use).
  - `path-helpers.ts` ← `packages/trees/src/model/pathHelpers.ts` (`getAncestorDirectoryPaths` only — used for the git-status rollup).
  - Git-status parsing lives in `src/tree-source.ts` (porcelain → label + ancestor rollup), informed by Pierre's `GIT_STATUS_LABEL`; the DOM-coupled `gitStatus.ts` chain is not vendored.

- [x] **CLI flags for tree rendering** (extracted in `view` before `git`-style parsing, so they don't leak): `--all`/`-a`, `--no-icons` (default icons on, `▾` dir marker), `--git-status`/`--no-git-status`. Depth limit `--level <n>` deferred (optional).

- **Config namespace decision:** `[pierre]` stays unchanged — it is honest passthrough of real `@pierre/diffs` options. The terminal tree/view options (`--with-tree`, `--icons`, `--git-status`, `--all`) are **suiseki's own** (the tree borrows only Pierre's *sort comparator*, not Pierre's SVG/DOM/interactive option surface), so they do **not** go under `[pierre.trees]` — that would falsely claim a Pierre option surface we do not expose. Suiseki-owned options live in new `[view]` / `[tree]` sections. First one: `[view].with-tree`. Tree toggles (`icons`/`git-status`) stay CLI-only until they earn persistence.

- [x] **`--with-tree` / `-t` flag + `[view].with-tree` config default.** `--with-tree` (or `-t`) turns the sidebar on; `--with-tree=false` turns it off (mirrors the config key, so no awkward `--no-with-tree`). `[view]` is suiseki's first owned config section (schema, env `SUISEKI_VIEW_WITH_TREE`, validation, and the annotated `suiseki config` reference all updated). Status glyphs unified with the diff header: `Δ` modified, `+` added, `?` untracked, `-` deleted, `→` renamed, `!` ignored (copied folds into added).

- [x] **`make setup` creates the `sat` symlink** (`ln -sf suiseki bin/sat`). Note for `01-publishing-suiseki.md`: release archives + Homebrew formula should also install the `sat` symlink.

- [x] **Help text + `view` usage** in `getHelpText()` and `getViewHelpText()` (file + directory + stdin forms, tree flags, the `sat` symlink).

- [x] **Tests** (follow AGENTS testing rules — `describe` per function, `assert()` narrowing, no conditionals/try-catch, descriptive names, temp dirs, no reliance on global git config):
  - `src/render/file.test.ts`: line numbering + gutter, no diff background, language detection, large-file plaintext fallback, header, binary handled in CLI, stdin label.
  - `src/render/tree.test.ts`: structure from a path list, Pierre sort order, tree-drawing characters, `▾` icon toggle, git-status column + ancestor rollup, status coloring.
  - `src/vendor/pierre/sort-children.test.ts`: comparator semantics.
  - `src/view-target.test.ts`: file/dir/stdin/missing classification.
  - `src/cli.integration.test.ts`: `suiseki view <file|dir|->`, missing/binary handling, and `sat` argv0 dispatch via a compiled binary named `sat`.

## Verification gates (every phase)

- [x] `bun check` (tsc + Biome) clean.
- [x] `bun test` green — 195 tests; diff/merge-conflict suites unregressed. Integration + config tests are hermetic (clean `SUISEKI_*` env + isolated config dir), verified passing with `SUISEKI_VIEW_WITH_TREE=true` set.
- [x] `make build` succeeds; binary 71 MB (well under the ~80 MB threshold — no new heavy deps).
- [x] Manual: `sat src/render/diff.ts` (highlight + gutter), `sat .` (tree + git status), `sat -t src/render/file.ts` (reveal sidebar), `sat README.md | head` (early-pipe stop), subdir tree path reconciliation.

## Suggested phase order

1. **A — shared extraction refactor** (`highlight.ts`), diff tests green.
2. **B — `view`/file viewer** + tests.
3. **C — argv0 dispatch + router + `sat` symlink in `make setup`** + tests.
4. **D — vendored sort/path-helpers + `tree` viewer** (FS/git walk, sort, glyphs, git-status) + tests.
5. **E — `--with-tree` sidebar** + tests.
6. **F — README + help text + check off plan boxes** (and the v2 bullet in `00-building-suiseki.md`).

## README update (phase F)

Once the features land, the README needs a pass for the broader identity (suiseki is the *art of viewing*, not just diff viewing).

- [x] **Tagline + 30-second pitch** — tagline now reads "diffs, files, and trees"; the Status section covers all three.
- [x] **Subcommand reference** — documented `suiseki view` / `sat` (file, directory tree, stdin) and the `sat` symlink + argv0 behavior in a "Viewing files and trees" section. There is no `suiseki tree` verb; `view`/`sat` on a directory trees it.
- [x] **`view` / `sat` examples** — file, directory, stdin, and `--with-tree` recipes.
- [x] **`tree` examples** — directory usage with the git-status column, `--all`, and `--no-icons`.
- [x] **Comparison table** — cut. suiseki describes its own capabilities directly rather than comparing to peers, so the README has no comparison table.

Screenshots and casts are launch presentation, not part of this plan; they are tracked in [`03-making-suiseki-public.md`](./03-making-suiseki-public.md). `TODO(screenshot)` placeholders are already wired into the README so the captures can be dropped in there.

## v2 sanity checks

- [x] argv0 dispatch is observable and reliable in the compiled binary run through a symlink (uses `process.argv0`; verified by a compiled-`sat` integration test).
- [x] Default behavior (`suiseki` with no args) unchanged this pass; `sat`/`view` with no path trees the cwd on a TTY and reads stdin when piped.

## `--color-only` interactive diff filter

Graduated to its own plan: [`04-color-only-diff-filter.md`](./04-color-only-diff-filter.md). It is a separate diff-rendering path (line-for-line colorization for `git add -p`), not part of the v2 view/tree milestone, so it tracks independently.
