# suiseki — publishing & release

> Companion plan to [`00-building-suiseki.md`](./00-building-suiseki.md). That document drives feature work and README polish; this one drives the release engineering needed to put suiseki binaries in front of users.

Start this plan once v1 features are complete and the README is in shape. Until then, dev builds via `make build` (which writes `bin/suiseki`) are sufficient.

## Performance pass (before shipping binaries)

Do this before cutting the first release so users hit a well-characterized renderer. Tackle it ahead of the v2 work in [`02-extending-suiseki.md`](./02-extending-suiseki.md) too — the new `view` and `tree` subcommands should inherit a streaming-friendly pipeline rather than being retrofitted later.

Baseline measured on v1 (compiled binary, `--no-pager`, MacBook):

- 10K-line diff (230 KB): ~0.47s, ~414 MB RSS
- 100K-line diff (2.4 MB): ~2.82s, ~875 MB RSS

That's already acceptable, so the goal here is "good enough for the published release" rather than a rewrite. Avoid the v0/v1 plan's reflex of "switch to `shiki-stream`": Pierre's `parsePatchFiles` is whole-buffer by design, and we already tokenize line-by-line, so a streaming tokenizer doesn't touch the actual hotspot.

**Profiling finding (confirmed):** the dominant cost is Shiki's per-line grammar tokenization. On a 100K-line synthetic diff, the per-file render loop is ~97% of total time; forcing plaintext tokenization (no grammar) cuts that loop ~15×. Parse (~63ms), word diff (~90ms), ANSI emission, and join (~82ms) are all noise. This confirms the per-file plaintext fallback as the biggest time lever, and reframes output streaming as a memory + time-to-first-paint win (not a wall-clock win, since tokenization dominates regardless).

- [x] **Profile a representative real-world diff** (large monorepo refactor, or the 100K-line synthetic fixture). Pinpoint the dominant cost: parse, tokenize, ANSI emission, output build, or stdout write. *(Done — Shiki grammar tokenization dominates; see finding above.)*
- [x] **Output streaming.** Render each file as it finishes and write to stdout immediately, rather than concatenating into one string and writing at the end. Keep the buffered path when stdout is a TTY + `less --quit-if-one-screen` is in use (it needs total length). *(Done — `streamDiffBlocks` generator + per-block backpressured stdout writes; pager and merge-conflict paths stay buffered. Cut 100K-line peak RSS ~875 MB → ~600 MB.)*
- [x] **Per-file syntax-highlight fallback.** If a file exceeds a configurable line threshold, render it as plaintext (no per-line `codeToTokensBase` call). Same pattern as the existing `shiki.max-line-length` fallback, just file-scoped. *(Done — `shiki.max-file-lines`, default 10000, with `--max-file-lines` flag + env var and a dim header note. 30K-line single file: ~2s → ~0.3s.)*
- [x] **Large-patch test fixture.** Generate a multi-thousand-line synthetic patch; assert that output completes within a sanity bound. *(Done in `src/render/diff.test.ts` — also asserts blocks stream incrementally, since `parsePatchFiles` is whole-buffer so "first file before parse finishes" isn't achievable; the honest property is incremental per-file emission after parse.)*
- [x] **Document perf characteristics in the README.** *(Done — README "Performance" section describes the durable behavior: per-file streaming + the `max-file-lines` plaintext guard. Deliberately dropped a benchmark table — the time/RSS numbers are too machine/theme/fixture-dependent to publish, and read scarier than the real single-file feel, e.g. a 10K-line file is ~0.6s.)*

## Publishing

- [x] Primary distribution: prebuilt binaries via GitHub Releases (Linux x64/arm64 glibc, macOS x64/arm64, Windows x64/arm64). *(First release `v0.1.0` shipped via the pipeline.)*
- [x] GitHub Actions runs `bun test`, builds each target, and uploads binaries to the release. *(Done — the `publish` job in `.github/workflows/main-branch-workflow.yaml`: checks out the tag, asserts tag == package.json version, `make release`, then `gh release create` with binaries + checksums.)*
- [x] Install script (`install.sh`) detects platform, fetches the latest binary from GitHub Releases, and installs to `/usr/local/bin/`. *(Done — `scripts/install.sh`: detects OS/arch, resolves the asset, downloads it + `checksums.txt`, verifies SHA-256, installs to `/usr/local/bin` (override via `SUISEKI_INSTALL_DIR`), pins via `SUISEKI_VERSION`/arg. Full `make init` parity: also reuses `setup-path.sh` to register PATH and runs `config --init`. README install section updated.)*
- [x] **Label-driven release, CI-only, single pipeline** *(added during this pass, beyond the original plan)*. Releases happen only through CI — no manual path. `main-branch-workflow.yaml` runs on push to `main` as one chained pipeline: **build and verify** → **plan** (read the commit's PR semver label via the GitHub API) → **tag** (`bun pm version <level>` + tag + push) → **publish** (build all targets + `gh release create`). Push-triggered so direct pushes are still verified; release stages fire only when a `patch`/`minor`/`major` label is present. The bump commit/tag are pushed with `GITHUB_TOKEN` (which doesn't re-trigger a workflow), so no release loop. `release-guard.yaml` requires exactly one semver label per PR and forbids hand-editing the `package.json` version. *(Caveats: if `main` is branch-protected, the bump/tag push needs bypass or a PAT/App token. Every merged labeled PR releases — no `no-release` escape hatch, and bot PRs like renovate need a semver label.)*
- [x] `suiseki --version` prints the current version (embed at compile time via `bun build --define`). *(Done — `src/version.ts` reads a `--define`'d `SUISEKI_VERSION`, falling back to `"dev"` for `bun run`. `scripts/build.sh` stamps it from `package.json` via `bun pm pkg get version` (its JSON-quoted output doubles as the JS string literal `--define` needs). `package.json` `version` is canonical; release flow is `bun pm version <patch|minor|major>` which bumps + tags `vX.Y.Z` so the tag can't drift. `--version`/`-v` wired in the CLI.)*
- [x] `suiseki upgrade` checks the GitHub Releases API for a newer version, downloads the matching binary, and replaces the running executable in-place. *(Done — `upgrade-command.ts` holds the decision logic behind a `ReleaseClient` port (unit-tested with an in-memory fake); `upgrade-io.ts` is the real fetch/fs adapter (excluded from coverage). Resolves the platform asset, verifies SHA-256, then temp-write + atomic rename over `process.execPath`. A "dev" compiled binary always pulls latest (clean path back to mainline). Refuses when running from source (`bun run`, where execPath is the bun runtime — detected via the `$bunfs` standalone marker) and on Windows. Verified end-to-end in a compiled binary.)*
- [~] ~~Opt-in auto-update check~~ **Cancelled.** suiseki is a short-lived filter with no in-process background, so a startup nudge would mean either slowing the hot path or a detached-child + disk-cache dance. Not worth the complexity; `suiseki upgrade` (explicit) covers updating.
- [x] Homebrew tap ships a `suiseki.rb` formula. *(Done — lives in the separate `michaeldlfx/homebrew-suiseki` tap repo (Homebrew requires the `homebrew-` prefix; `brew install michaeldlfx/suiseki/suiseki`). `scripts/generate-formula.sh` renders the formula from a release's `checksums.txt` (4 glibc/macOS targets; `on_macos`/`on_linux` × `on_arm`/`on_intel`). Token-free `update-formula.yaml` (weekly backstop + `workflow_dispatch`) regenerates and commits it using the tap's own `GITHUB_TOKEN`, reading suiseki's public releases — no cross-repo token. Deliberately input-less so a dispatch caller can't redirect the source. `suiseki.rb` is created on first run after a release. brew install line added to suiseki README. Caveat: cron auto-disables after ~60 days of tap inactivity.)*
- [~] ~~npm publish~~ **Not doing** (user decision: binaries are the distribution story). No npm package, squat, or placeholder.

## Release target policy

Local development builds write only `bin/suiseki`. Release builds write named artifacts under `dist/`.

Bun supports cross-compiling standalone executables with `bun build --compile --target=...`, so the first release workflow should try a cross-build matrix before adding per-platform build runners. Do not add GitHub Actions workflows until release work starts.

Initial release targets *(all confirmed cross-compiling from macOS arm64 via `scripts/build-release.sh` / `make release`; single-machine matrix is viable)*:

- [x] `bun-darwin-arm64` → `dist/suiseki-darwin-arm64`
- [x] `bun-darwin-x64` → `dist/suiseki-darwin-x64`
- [x] `bun-linux-x64-baseline` → `dist/suiseki-linux-x64`
- [x] `bun-linux-arm64` → `dist/suiseki-linux-arm64`
- [x] `bun-windows-x64` → `dist/suiseki-windows-x64.exe`
- [x] `bun-windows-arm64` → `dist/suiseki-windows-arm64.exe`
- ~~`bun-linux-x64-musl` / `bun-linux-arm64-musl`~~ **Dropped** — musl is not supported (smoke tests failed; not worth the workaround).

Release validation:

- [x] First pass: prove each target compiles and upload artifacts with checksums. *(Done — `make release` builds the 6 targets + `dist/checksums.txt`. CI upload is the `publish` job in `main-branch-workflow.yaml`; first release `v0.1.0` published.)*
- [x] Later pass: smoke-test native artifacts on matching GitHub Actions runners where practical. *(Built — `.github/workflows/smoke-binaries.yaml`: cross-compiles all targets on one runner (as releases do), then runs each artifact on its native OS runner with the 3-command smoke test. Covers 4 targets on free hosted runners — darwin-arm64 (macos-14), linux x64/arm64 (ubuntu-latest/ubuntu-24.04-arm), windows-x64. Not smoke-tested but still shipped: darwin-x64 (Intel macOS runner retired) and windows-arm64 (no hosted runner). Dispatch-only (`gh workflow run smoke-binaries`), not a per-release gate — it verifies a Bun-toolchain property that rarely changes.)*
- [x] Minimal smoke test: `suiseki --version`, `suiseki --help`, and a tiny fixture diff piped through stdin. *(Done against the native `dist/suiseki-darwin-arm64`; all three pass. Non-native artifacts remain to be smoke-tested on their runners.)*
- [x] Cross-built artifacts pass the native smoke tests (`smoke-binaries.yaml`), and `v0.1.0`/`v0.1.1` shipped, so release jobs stay a single-machine cross-build. No per-OS split needed; revisit only if a future smoke run fails.
- [x] Linux x64 stays on the baseline target (`bun-linux-x64-baseline`) for broad CPU compatibility. No separate modern build, since the size/perf tradeoff does not justify one for a diff renderer.
