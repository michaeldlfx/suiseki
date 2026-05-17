# v0 polish — align with Pierre's diffs.com rendering

Tracking plan for the v0 polish items from `00-building-suiseki.md`.

## Checklist

- [x] **Blank line between files** — add an empty line between the end of one file's diff and the next file's header
- [x] **File header color** — changed from blue (`#79b8ff`) to neutral white (`#e1e4e8`), matching Pierre's default foreground
- [x] **File status icon in header** — use `file.type` (`ChangeTypes`) from Pierre: `Δ` change, `+` new, `-` deleted, `→` rename-pure/rename-changed
- [x] **Path vs filename display** — directory dimmed (`#8b949e`), filename bold white (`#e1e4e8`). Renames: `dim(old/) bold(old) → dim(new/) bold(new)`
- [x] **Pager support** — spawn `less -R --no-init --quit-if-one-screen` when stdout is TTY. `--no-pager` flag or `SUISEKI_NO_PAGER=1` to disable.
- [x] **Tests updated** — new tests for status icon, path display, new/deleted file icons, blank line between files
- [x] **Verification** — `bun check` and `bun test` pass (27 tests, 51 assertions)

## Implementation notes

### File status icon
Pierre's `ChangeTypes` union: `'change' | 'new' | 'deleted' | 'rename-pure' | 'rename-changed'`
Available via `file.type` on `FileDiffMetadata`.

Mapping:
- `change` → `Δ` (Greek delta)
- `new` → `+`
- `deleted` → `-`
- `rename-pure` / `rename-changed` → `→`

Color mapping:
- `change` → `#e1e4e8` (neutral)
- `new` → `#3fb950` (green)
- `deleted` → `#f85149` (red)
- `rename-*` → `#d2a8ff` (purple)

### File header color
Pierre uses neutral foreground (`#fff` dark / `#000` light) via CSS `light-dark()`.
Suiseki uses `#e1e4e8` (light neutral for dark terminal backgrounds).

### Path vs filename display
Format: `dimmed(directory/) bold(filename)` — e.g., dim `src/render/` bold `diff.ts`
For renames: `dim(old/path/) bold(oldFile.ts) → dim(new/path/) bold(newFile.ts)`
