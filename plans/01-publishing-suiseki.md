# suiseki — publishing & release

> Companion plan to [`00-building-suiseki.md`](./00-building-suiseki.md). That document drives feature work and README polish; this one drives the release engineering needed to put suiseki binaries in front of users.

Start this plan once v1 features are complete and the README is in shape. Until then, dev builds via `make build` (which writes `bin/suiseki`) are sufficient.

## Performance pass (before shipping binaries)

Do this before cutting the first release so users hit a well-characterized renderer. Tackle it ahead of the v2 work in [`02-extending-suiseki.md`](./02-extending-suiseki.md) too — the new `view` and `tree` subcommands should inherit a streaming-friendly pipeline rather than being retrofitted later.

Baseline measured on v1 (compiled binary, `--no-pager`, MacBook):

- 10K-line diff (230 KB): ~0.47s, ~414 MB RSS
- 100K-line diff (2.4 MB): ~2.82s, ~875 MB RSS

That's already acceptable, so the goal here is "good enough for the published release" rather than a rewrite. Avoid the v0/v1 plan's reflex of "switch to `shiki-stream`": Pierre's `parsePatchFiles` is whole-buffer by design, and we already tokenize line-by-line, so a streaming tokenizer doesn't touch the actual hotspot.

- [ ] **Profile a representative real-world diff** (large monorepo refactor, or the 100K-line synthetic fixture). Pinpoint the dominant cost: parse, tokenize, ANSI emission, output build, or stdout write.
- [ ] **Output streaming.** Render each file as it finishes and write to stdout immediately, rather than concatenating into one string and writing at the end. Keep the buffered path when stdout is a TTY + `less --quit-if-one-screen` is in use (it needs total length).
- [ ] **Per-file syntax-highlight fallback.** If a file exceeds a configurable line threshold, render it as plaintext (no per-line `codeToTokensBase` call). Same pattern as the existing `shiki.max-line-length` fallback, just file-scoped.
- [ ] **Large-patch test fixture.** Generate a multi-thousand-line synthetic patch; assert that output completes within a sanity bound and that the first rendered file appears before parsing finishes (proves output streaming).
- [ ] **Document perf characteristics in the README** with measured size/time numbers users can expect.

## Publishing

- [ ] Primary distribution: prebuilt binaries via GitHub Releases (Linux x64/arm64, macOS x64/arm64, Windows x64).
- [ ] GitHub Actions on tag runs `bun test`, builds each target, and uploads binaries to the release.
- [ ] Install script detects platform, fetches the latest binary, and installs to `/usr/local/bin/`.
- [ ] Homebrew tap ships a `suiseki.rb` formula.
- [ ] npm publish decision is made post-v1. If done, name is `suiseki-cli` or scoped `@<handle>/suiseki` with `bin: { suiseki: "..." }`; otherwise squat the name with a placeholder package pointing to the binaries.

## Release target policy

Local development builds write only `bin/suiseki`. Release builds write named artifacts under `dist/`.

Bun supports cross-compiling standalone executables with `bun build --compile --target=...`, so the first release workflow should try a cross-build matrix before adding per-platform build runners. Do not add GitHub Actions workflows until release work starts.

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
