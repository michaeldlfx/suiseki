# suiseki — `--color-only` interactive diff filter

> Companion plan to [`00-building-suiseki.md`](./00-building-suiseki.md). A post-v2 enhancement to the diff path, graduated out of [`02-extending-suiseki.md`](./02-extending-suiseki.md). It is independent of the v2 `view`/`tree` milestone and of the public launch (`04-making-suiseki-public.md`), so it can be picked up whenever it earns priority.

**Goal:** support Git's `interactive.diffFilter` (`git add -p`, `git reset -p`, etc.) with a line-preserving colorizer, so suiseki can color interactive hunk selection without breaking it.

## Why a separate path

Git's `interactive.diffFilter` feeds the renderer one diff at a time and expects the output to be a **line-for-line colorization** of the input: same line count, same byte structure modulo ANSI escapes, because the interactive UI counts lines to map user keystrokes onto hunks. The normal `suiseki` diff path does not do this: it parses, re-emits headers, gutters, backgrounds, and inline word-diff splits, all of which change the line count.

The `--color-only` advertisement (README, help text, and a no-op parser flag) was removed in the v1 review pass to avoid pointing users at a broken workflow. This plan tracks bringing it back as a real feature.

## Features

- [x] **New module `src/render/color-only.ts`** — separate rendering path. Walks
      the raw diff input line by line, classifies each line, and emits the
      same line with ANSI codes added:
   - File header lines (`diff --git`, `index`, `---`, `+++`): metadata color, unchanged content.
   - Hunk header lines (`@@ ... @@`): hunk color, unchanged content.
   - Context / `+` / `-` lines: keep leading `+`/`-`/` ` in place; Shiki-tokenize the rest; emit content with syntax foreground plus the diff +/- background; reset at EOL.
   - Binary / rename / mode-change headers: pass through colorized but otherwise untouched.
   - **Invariant: input line count == output line count.** No splitting long lines, no tab expansion, no trailing-whitespace normalization, no inline word-diff (word-diff inserts tokens mid-line and breaks the invariant).
- [x] **CLI wiring** — `--color-only` triggers the new path before the normal
      `renderDiff` / `renderMergeConflictFile` branch in `src/cli.ts`. Merge
      conflict files pass through to the same line-preserving renderer (no
      special-case rendering in color-only mode).
- [x] **Help text + README** — add `--color-only` back to the options list and
      restore the `interactive.diffFilter = suiseki --color-only` recommendation
      in both the bash and `.gitconfig` snippets.
- [x] **Tests `src/render/color-only.test.ts`**:
   - Output line count equals input line count for representative fixtures.
   - Headers / hunk markers / context / +/- lines all classified correctly.
   - ANSI strips back to the original byte content for each line.
   - Word-diff is disabled regardless of config.
- [x] **Manual verification** — exercise `git add -p` against a real repo with
      `interactive.diffFilter` configured, confirm hunk selection still works.
      Verified line-count preservation, byte-for-byte stripped equality, and
      selective (n/y) staging mapping the right hunk through the filter.
