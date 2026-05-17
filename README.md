# suiseki

> A terminal renderer for diffs and code.

**Pierre** is French for *stone*. The library powering this tool — `@pierre/diffs` — is the work of The Pierre Computer Company.

**水石 / suiseki** is the Japanese art of stone appreciation — a contemplative practice, imported from Chinese scholar's-rock tradition and refined in Japan, of viewing naturally-formed stones for their beauty: finding landscapes, figures, and quiet meaning in their shape. The literal reading is *water-stone* — stones polished and revealed by water over time.

The name is a homage. *Pierre → stone → 水石*. The tool exists to do, for code, what suiseki does for stones: take something rough and naturally-occurring — the raw output of `git diff`, the unformatted text of a source file — polish it, and reveal the form underneath. Made to be looked at.

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
SUISEKI_NO_PAGER=1 git diff | suiseki
```

### As a Git pager

Use per-command pager settings so `suiseki` renders diffs without taking over
every paged Git command, such as `git log`:

```bash
git config --global pager.diff 'suiseki'
git config --global pager.show 'suiseki'
git config --global interactive.diffFilter 'suiseki --color-only'
```

Or open `~/.gitconfig` with your editor and set:

```gitconfig
[pager]
	diff = suiseki
	show = suiseki

[interactive]
	diffFilter = suiseki --color-only
```

With that configured, `git diff`, `git show`, and interactive patch selection
render through `suiseki`. Plain `git log` keeps Git's normal pager output.

## Configuration

`suiseki` reads a TOML config file from (in order of precedence):

1. `$SUISEKI_CONFIG_DIR/config.toml`
2. `$XDG_CONFIG_HOME/suiseki/config.toml` (defaults to `~/.config/suiseki/config.toml`)
3. `~/.suiseki/config.toml`

All settings can also be overridden via environment variables.

```toml
[pierre]
view = "unified"             # SUISEKI_PIERRE_VIEW (unified | split)
line-numbers = true          # SUISEKI_PIERRE_LINE_NUMBERS
change-indicator = "sign"    # SUISEKI_PIERRE_CHANGE_INDICATOR (sign | bar | background)
diff-background = true       # SUISEKI_PIERRE_DIFF_BACKGROUND
file-header = true           # SUISEKI_PIERRE_FILE_HEADER
hunk-header = "none"         # SUISEKI_PIERRE_HUNK_HEADER (full | none)
word-diff = "word"           # SUISEKI_PIERRE_WORD_DIFF (word | char | none)
max-line-diff-length = 1000  # SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH

[shiki]
theme = "github-dark"        # SUISEKI_SHIKI_THEME (any bundled Shiki theme)
max-line-length = 10000      # SUISEKI_SHIKI_MAX_LINE_LENGTH
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) (runtime, package manager, test runner, compiler)

### Make targets

Run `make` or `make help` to see all available targets:

| Target | Description |
|--------|-------------|
| `make help` | Show all available targets |
| `make install` | Install dependencies |
| `make install-frozen` | Install dependencies from lockfile |
| `make run` | Run project as TypeScript sources |
| `make build` | Build the `./bin/suiseki` binary |
| `make start` | Run the compiled binary |
| `make clean` | Remove build artifacts and caches |
| `make test` | Run all tests with coverage |
| `make check` | Type check + lint/format (auto-fix) |
| `make check-ci` | Type check + lint (no auto-fix, for CI) |
| `make format` | Format code with Biome |

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
- **v1:** practical `delta` alternative with split view, inline word diff, theming, pager integration, config, and prebuilt binaries. *(current)*
- **v2:** broader terminal code viewer with `view` and `tree` subcommands.

## Credits

`suiseki` is built around the idea that Pierre's renderer-agnostic parsing and tree logic, paired with Shiki's syntax and theme ecosystem, can produce a better terminal viewing experience for code.
