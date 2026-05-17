# suiseki — extending beyond diffs (v2)

> Companion plan to [`00-building-suiseki.md`](./00-building-suiseki.md) (features, README) and [`01-publishing-suiseki.md`](./01-publishing-suiseki.md) (release engineering). Start this plan once v1 has shipped to GitHub Releases.

**Goal:** the tool stops being just a diff renderer. It becomes the general "view code in the terminal" tool — diffs, files, and static trees. The name `suiseki` (the art of viewing stones) already covers this expanded identity; no rename needed.

## Performance foundation (do first)

Tackle this before adding `view` and `tree`, so the new subcommands inherit a streaming-friendly pipeline rather than being retrofitted later.

- [ ] **Profile, then pick the right win.** v1's renderer handles a 10K-line diff in ~0.5s and a 100K-line diff in ~2.8s on a real laptop (compiled binary path, no pager). Before changing architecture, capture a profile of the 100K-line case and confirm the bottleneck — Pierre's `parsePatchFiles` is whole-buffer by design, so the win is unlikely to come from "use `shiki-stream`" alone. Likely candidates: output streaming (write rendered files as we finish them instead of buffering), batched `codeToTokensBase` calls, or skipping syntax highlighting above a per-file line threshold.
- [ ] **Output streaming.** Render each file/hunk and write to stdout as soon as it's ready, instead of building one big string and writing at the end. Disables `less --quit-if-one-screen` for streamed paths since total length isn't known up front; keep the buffered path when pager TTY + small input.
- [ ] **Large-patch test fixture.** Generate a multi-thousand-line synthetic patch and assert (a) output completes, (b) memory stays within a sanity bound, (c) the first rendered file appears before parsing finishes (proves streaming).
- [ ] **Document the perf characteristics in the README** once measured: include the size/time numbers users can expect.

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
- [ ] **Comparison table additions** — vs `bat`, vs `tree`, vs `eza`, alongside the existing comparison vs `delta`.
- [ ] **Screenshot/cast updates** — show the new subcommands in action.

## v2 sanity checks

- [ ] Confirm `@pierre/trees` model imports cleanly without DOM globals (same check as v0 did for `@pierre/diffs`)
- [ ] Default behavior (`suiseki` with no args) feels right in practice — try both "in a dirty repo" and "in a clean directory"
