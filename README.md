# suiseki

> A terminal renderer for diffs and code.

**Pierre** is French for *stone*. The library powering this tool — `@pierre/diffs` — is the work of The Pierre Computer Company.

**水石 / suiseki** is the Japanese art of stone appreciation — a contemplative practice, imported from Chinese scholar's-rock tradition and refined in Japan, of viewing naturally-formed stones for their beauty: finding landscapes, figures, and quiet meaning in their shape. The literal reading is *water-stone* — stones polished and revealed by water over time.

The name is a homage. *Pierre → stone → 水石*. The tool exists to do, for code, what suiseki does for stones: take something rough and naturally-occurring — the raw output of `git diff`, the unformatted text of a source file — polish it, and reveal the form underneath. Made to be looked at.

## Getting started

### Install (prebuilt binary)

No Bun required, the binary is self-contained:

```bash
curl -fsSL https://raw.githubusercontent.com/michaeldlfx/suiseki/main/scripts/install.sh | sh
```

This detects your platform, downloads the matching binary from the latest
[GitHub release](https://github.com/michaeldlfx/suiseki/releases), verifies its
SHA-256 checksum, installs it to `/usr/local/bin`, registers that directory on
your `PATH`, and creates a default config at `~/.suiseki/config.toml` (the same
end state as `make init`). Override the directory with `SUISEKI_INSTALL_DIR`, or
pin a version with `SUISEKI_VERSION=0.1.0`.

macOS (x64 and arm64) and Linux (x64 and arm64, glibc) are supported. On
Windows, download `suiseki-windows-x64.exe` from the releases page.

### Install with Homebrew

```bash
brew install michaeldlfx/suiseki/suiseki
```

### Install from source

`suiseki` runs on [Bun](https://bun.sh/). If you don't have it yet, install it first:

```bash
brew install oven-sh/bun/bun
```

(or follow the [Bun install guide](https://bun.sh/docs/installation) for other platforms).

Then clone and run the one-command setup:

```bash
git clone https://github.com/michaeldlfx/suiseki
cd suiseki
make init
```

`make init` installs dependencies, builds the `./bin/suiseki` binary, registers it on your `PATH` (zsh, bash, and fish are supported), and creates a default config at `~/.suiseki/config.toml`.

### Updating

If you installed a prebuilt binary, update in place:

```bash
suiseki upgrade
```

It checks GitHub Releases for a newer version, downloads the binary for your
platform, verifies its checksum, and replaces the running executable.

### Wire up Git

With `suiseki` installed, wire it up as your Git diff pager:

```bash
git config --global pager.diff 'suiseki'
git config --global pager.show 'suiseki'
```

That's it. Run `git diff` and enjoy.

> **Tip:** to customise your config, run `suiseki config` for a fully-annotated
> reference of every option, or edit `~/.suiseki/config.toml` directly.

## Status

`suiseki` is in v1 development: unified and split diff views work with Shiki syntax highlighting, theme-derived diff backgrounds, configurable file/hunk headers, line numbers, and pager support. It works both as a piped Unix filter and as a Git pager.

The project is a friendly terminal surface for Pierre's renderer-agnostic packages and Shiki's syntax/theme ecosystem: `@pierre/diffs` first, `@pierre/trees` next, and Shiki throughout. It is a homage and companion, not a fork or replacement.

The implementation plan lives in `plans/00-building-suiseki.md`.

## Usage

```bash
# pipe a diff
git diff | suiseki

# pass git diff arguments directly
suiseki HEAD~1 HEAD
suiseki --staged
suiseki HEAD~3..HEAD -- src/

# disable the pager
suiseki --no-pager HEAD~1
SUISEKI_NO_PAGER=true git diff | suiseki

# override config for one run
suiseki --view split --theme pierre-light HEAD~1
```

### As a Git pager

Use per-command pager settings so `suiseki` renders diffs without taking over
every paged Git command, such as `git log`:

```bash
git config --global pager.diff 'suiseki'
git config --global pager.show 'suiseki'
```

Or open `~/.gitconfig` with your editor and set:

```gitconfig
[pager]
	diff = suiseki
	show = suiseki
```

With that configured, `git diff` and `git show` render through `suiseki`.
Plain `git log` keeps Git's normal pager output.

## Configuration

`suiseki` resolves configuration from (highest precedence first):

1. CLI flags
2. Environment variables (`SUISEKI_*`)
3. Nearest `.suiseki.toml` found by walking up from the current directory
4. `$SUISEKI_CONFIG_DIR/config.toml`
5. `$XDG_CONFIG_HOME/suiseki/config.toml` (defaults to `~/.config/suiseki/config.toml`)
6. `~/.suiseki/config.toml`

Per-repo `.suiseki.toml` files merge on top of user config.

### Config reference

Run `suiseki config` to print a fully-annotated reference with every option,
its valid values, default, and corresponding environment variable:

```bash
suiseki config
```

To create `~/.suiseki/config.toml` pre-filled with annotated defaults:

```bash
suiseki config --init
```

### Full config with defaults

```toml
[pierre]
view = "unified"             # SUISEKI_PIERRE_VIEW (unified | split)
line-numbers = true          # SUISEKI_PIERRE_LINE_NUMBERS
change-indicator = "sign"    # SUISEKI_PIERRE_CHANGE_INDICATOR (sign | bar | background)
diff-background = true       # SUISEKI_PIERRE_DIFF_BACKGROUND
file-header = true           # SUISEKI_PIERRE_FILE_HEADER
hunk-header = "none"         # SUISEKI_PIERRE_HUNK_HEADER (full | none)
word-diff = "word-alt"       # SUISEKI_PIERRE_WORD_DIFF (word-alt | word | char | none)
max-line-diff-length = 1000  # SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH

[shiki]
theme = "pierre-dark"        # SUISEKI_SHIKI_THEME (any bundled Shiki theme or Pierre theme)
max-line-length = 10000      # SUISEKI_SHIKI_MAX_LINE_LENGTH
max-file-lines = 10000       # SUISEKI_SHIKI_MAX_FILE_LINES
```

Every config key can be overridden with a matching CLI flag, such as
`--view split`, `--word-diff none`, `--no-line-numbers`, or
`--max-line-length 5000`. Run `suiseki --help` for the full list.

`max-file-lines` is a performance guard. When a single file has more added +
removed lines than this, the `-N +M` total shown in its header, it renders as
plaintext (no syntax highlighting) while keeping diff backgrounds and gutters. A
dim note in the file header marks any file that falls back. See
[Performance](#performance).

### Themes

Run `suiseki themes` to list all available themes. Built-in Pierre themes:

- `pierre-dark` (default)
- `pierre-light`
- `pierre-dark-vibrant`
- `pierre-light-vibrant`

Any [Shiki bundled theme](https://shiki.style/themes) is also accepted (e.g. `github-dark`, `nord`, `dracula`).

Custom themes can be placed as `.json` VSCode-compatible theme files in `~/.suiseki/themes/`. The filename without `.json` becomes the theme name.

## Performance

`suiseki` renders and emits one file at a time, so output starts streaming to
stdout immediately and peak memory stays bounded by the largest file rather than
the whole diff. Typical files highlight in well under a second.

Render time is dominated by syntax tokenization, so a single very large file
would otherwise be slow. `shiki.max-file-lines` (default `10000`) guards against
that: a file with more added + removed lines than this, its `-N +M` header
total, renders as plaintext instead of paying for grammar highlighting on a file
you are usually scrolling past anyway, such as lockfiles, generated bundles, or
snapshots. Diff backgrounds, gutters, and a dim note in its header are kept.
Adjust it in config or with `--max-file-lines`.

## Development

### Prerequisites

- [Bun](https://bun.sh/) (runtime, package manager, test runner, compiler)

### Make targets

Run `make` or `make help` to see all available targets:

| Target | Description |
|--------|-------------|
| `make init` | First-time setup: install deps, build binary, register on PATH, create default config |
| `make setup` | Build binary, register on PATH, and create default config |
| `make help` | Show all available targets |
| `make install` | Install dependencies |
| `make install-frozen` | Install dependencies from lockfile |
| `make run` | Run project as TypeScript sources |
| `make build` | Build the `./bin/suiseki` binary |
| `make release` | Cross-compile all release targets into `dist/` with checksums |
| `make start` | Run the compiled binary |
| `make clean` | Remove build artifacts and caches |
| `make test` | Run all tests with coverage |
| `make check` | Type check + lint/format (auto-fix) |
| `make check-ci` | Type check + lint (no auto-fix, for CI) |
| `make format` | Format code with Biome |

### Releasing

Releases are CI-only. Every PR into `main` carries exactly one semver label,
`patch`, `minor`, or `major`. The `release guard` check enforces that label and
forbids hand-editing the `package.json` version (the label drives the bump). On
push to `main`, `main-branch-workflow.yaml` runs one pipeline: **build and
verify** (checks + tests + build) → **plan** (read the merged PR's label) →
**tag** (bump `package.json`, tag `v<version>`, push) → **publish** (build all
targets, create the GitHub Release with checksums). The release stages run only
when the commit's PR carried a semver label, so direct pushes are just verified.

## Tech Stack

- **Bun** + TypeScript for runtime, tests, and single-binary compilation.
- **Shiki** for syntax tokenization and theme compatibility.
- **`@pierre/diffs`** for diff parsing and iteration.
- **Arktype** for runtime validation of config, CLI options, and external boundaries.
- **ansis** for ANSI escape code helpers.
- **smol-toml** for TOML config parsing.
- **Biome** for formatting and linting.

## Roadmap

- **v0:** local unified-view diff renderer with Shiki highlighting, diff backgrounds, and pager support.
- **v1:** practical terminal diff renderer with split view, inline word diff, theming, pager integration, config, and prebuilt binaries. *(current)*
- **v2:** broader terminal code viewer with `view` and `tree` subcommands.

## Credits

`suiseki` is built around the idea that Pierre's renderer-agnostic parsing and tree logic, paired with Shiki's syntax and theme ecosystem, can produce a better terminal viewing experience for code.
