# suiseki — extending beyond diffs (v2)

> Companion plan to [`00-building-suiseki.md`](./00-building-suiseki.md) (features, README) and [`01-publishing-suiseki.md`](./01-publishing-suiseki.md) (release engineering). Start this plan once v1 has shipped to GitHub Releases.

**Goal:** the tool stops being just a diff renderer. It becomes the general "view code in the terminal" tool — diffs, files, and static trees. The name `suiseki` (the art of viewing stones) already covers this expanded identity; no rename needed.

## Features

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

- [ ] **Tests for each subcommand**.

## README update

Once the v2 features land, the README needs another pass to reflect the broader identity. The naming paragraph already supports this — suiseki is the *art of viewing*, not just diff viewing.

- [ ] **Tagline + 30-second pitch** — update to cover diff + file + tree, not just diff.
- [ ] **Subcommand reference** — document `suiseki diff`, `suiseki view`, `suiseki tree`, and the smart default.
- [ ] **`view` examples** — common file-viewing recipes, including `--with-tree`.
- [ ] **`tree` examples** — basic usage, git status annotations, `--all` to override `.gitignore`.
- [ ] **Comparison table additions** — add file-viewing peers (`bat`) and tree peers (`tree`, `eza`) alongside whatever diff peers the v1 comparison table ended up listing.
- [ ] **Screenshot/cast updates** — show the new subcommands in action.

## v2 sanity checks

- [ ] Confirm `@pierre/trees` model imports cleanly without DOM globals (same check as v0 did for `@pierre/diffs`)
- [ ] Default behavior (`suiseki` with no args) feels right in practice — try both "in a dirty repo" and "in a clean directory"

## `--color-only` interactive diff filter

Git's `interactive.diffFilter` (used by `git add -p`, `git reset -p`, etc.) feeds
the renderer one diff at a time and expects the output to be a **line-for-line
colorization** of the input — same line count, same byte structure modulo ANSI
escapes — because the interactive UI counts lines to map user keystrokes onto
hunks. v1's `suiseki` doesn't do this: it parses, re-emits headers, gutters,
backgrounds, and inline word-diff splits, which all change line count.

Removed the `--color-only` advertisement (README + help text + no-op parser) in
the v1 review pass to avoid pointing users at a broken workflow. This entry
tracks bringing it back as a real feature.

- [ ] **New module `src/render/color-only.ts`** — separate rendering path. Walks
      the raw diff input line by line, classifies each line, and emits the
      same line with ANSI codes added:
   - File header lines (`diff --git`, `index`, `---`, `+++`): metadata color, unchanged content.
   - Hunk header lines (`@@ ... @@`): hunk color, unchanged content.
   - Context / `+` / `-` lines: keep leading `+`/`-`/` ` in place; Shiki-tokenize the rest; emit content with syntax foreground plus the diff +/- background; reset at EOL.
   - Binary / rename / mode-change headers: pass through colorized but otherwise untouched.
   - **Invariant: input line count == output line count.** No splitting long lines, no tab expansion, no trailing-whitespace normalization, no inline word-diff (word-diff inserts tokens mid-line and breaks the invariant).
- [ ] **CLI wiring** — `--color-only` triggers the new path before the normal
      `renderDiff` / `renderMergeConflictFile` branch in `src/cli.ts`. Merge
      conflict files pass through to the same line-preserving renderer (no
      special-case rendering in color-only mode).
- [ ] **Help text + README** — add `--color-only` back to the options list and
      restore the `interactive.diffFilter = suiseki --color-only` recommendation
      in both the bash and `.gitconfig` snippets.
- [ ] **Tests `src/render/color-only.test.ts`**:
   - Output line count equals input line count for representative fixtures.
   - Headers / hunk markers / context / +/- lines all classified correctly.
   - ANSI strips back to the original byte content for each line.
   - Word-diff is disabled regardless of config.
- [ ] **Manual verification** — exercise `git add -p` against a real repo with
      `interactive.diffFilter` configured, confirm hunk selection still works.
