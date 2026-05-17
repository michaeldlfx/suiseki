# suiseki

> A terminal renderer for diffs and code.

**Pierre** is French for *stone*. The library powering this tool — `@pierre/diffs` — is the work of The Pierre Computer Company.

**水石 / suiseki** is the Japanese art of stone appreciation — a contemplative practice, imported from Chinese scholar's-rock tradition and refined in Japan, of viewing naturally-formed stones for their beauty: finding landscapes, figures, and quiet meaning in their shape. The literal reading is *water-stone* — stones polished and revealed by water over time.

The name is a homage. *Pierre → stone → 水石*. The tool exists to do, for code, what suiseki does for stones: take something rough and naturally-occurring — the raw output of `git diff`, the unformatted text of a source file — polish it, and reveal the form underneath. Made to be looked at.

## Status

`suiseki` is in early development. The current repository is a Bun/TypeScript scaffold with a local binary build path. The planned product is a read-only Unix-style CLI that renders diffs first, then source files and static project trees.

The project is intended as a friendly terminal surface for Pierre's renderer-agnostic packages and Shiki's syntax/theme ecosystem: `@pierre/diffs` first, `@pierre/trees` next, and Shiki throughout. It is a homage and companion, not a fork or replacement.

The implementation plan lives in `plans/00-building-suiseki.md`.

## Goals

- Render unified diffs with syntax highlighting and diff-aware backgrounds.
- Use Shiki's TextMate grammar and theme ecosystem as the source of truth for code colors.
- Bring Pierre's diff and tree model layers to the terminal where they can be cleanly tree-shaken.
- Stay read-only: read input, write ANSI to stdout, exit.
- Ship as a single `suiseki` binary via `bun build --compile`.

## Planned Usage

```bash
git diff | suiseki
suiseki HEAD~1 HEAD
suiseki view src/cli.ts
suiseki tree .
```

The `view` and `tree` commands are planned for v2. The first implementation target is diff rendering.

## Development

Install dependencies:

```bash
bun install
```

Run the TypeScript entrypoint:

```bash
make run
```

Build, run, and clean the local binary:

```bash
make build
make start
make clean
```

Show all available tasks:

```bash
make
```

## Quality

```bash
make check
make test
```

`make check` runs TypeScript checking and Biome. `make test` runs Bun's test runner.

## Tech Stack

- Bun + TypeScript for runtime, tests, and single-binary compilation.
- Shiki for syntax tokenization and theme compatibility.
- `@pierre/diffs` for diff parsing and iteration.
- Arktype for runtime validation of config, CLI options, and external boundaries.
- Biome for formatting and linting.

## Roadmap

- **v0:** local unified-view diff renderer with Shiki highlighting and diff backgrounds.
- **v1:** practical `delta` alternative with split view, inline word diff, theming, pager integration, config, and prebuilt binaries.
- **v2:** broader terminal code viewer with `view` and `tree` subcommands.

## Credits

`suiseki` is built around the idea that Pierre's renderer-agnostic parsing and tree logic, paired with Shiki's syntax and theme ecosystem, can produce a better terminal viewing experience for code. Credits are planned for Pierre, Shiki, and other runtime dependencies as the implementation lands.
