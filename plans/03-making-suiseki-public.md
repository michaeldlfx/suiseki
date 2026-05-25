# suiseki — making it public

> Companion plan to [`00-building-suiseki.md`](./00-building-suiseki.md) and [`01-publishing-suiseki.md`](./01-publishing-suiseki.md). Those drive features and release engineering; this one drives the public-facing presentation — the README polish and launch material that makes a stranger want to try suiseki.

These items were pulled out of `00`'s "README polish" section on purpose. They are presentation, not building: a screenshot, a peer comparison, a theme gallery, and install docs. None of them block the tool from working, and all of them want the final release binary and shipped themes to exist first. Keeping them here stops the v0/v1 build plan from carrying launch-marketing checkboxes it shouldn't own.

Start this plan once [`01-publishing-suiseki.md`](./01-publishing-suiseki.md) has produced installable binaries. Before that, the install docs have nothing to point at and screenshots would capture a pre-release build.

## Progress tracking

Same conventions as [`00-building-suiseki.md`](./00-building-suiseki.md):

- Check an item in the same change set as the work that satisfies it.
- Checked boxes mean committed progress, not local working-tree progress.
- Don't check an item for partial progress; split it instead.
- This plan rides on top of v1. When every item here is done, the published README is launch-ready.

## Dependencies

- **Install docs** need `01` complete: a Homebrew tap, `install.sh`, and prebuilt binaries on GH Releases must exist before the README can honestly document them.
- **Screenshot / theme gallery** want the final release binary and the shipped theme set, so captures reflect what users actually get.
- **Comparison table** has no dependency — it is pure prose and can be written (or cut) any time.

## README polish (public-facing)

In rough order of value:

- [ ] **Install** — Homebrew, install script, prebuilt binary download. Unblocked once `01` ships artifacts. This is the highest-value item: a stranger can't adopt the tool without it.
- [ ] **Screenshots or asciinema casts** for the README's `TODO(screenshot)` placeholders. Cover both the diff renderer (unified and split with a popular theme) and the file/tree viewer (`sat <file>` with the `--with-tree` sidebar, and `sat <dir>` showing the git-status tree). Prefer static images (or both) so the README renders on GitHub without playback.
- [ ] **Themes gallery** — small gallery showing a few popular Shiki themes plus the Pierre theme variants applied to the same diff. Reuse the screenshot tooling.
- [ ] **Comparison table** (optional) — only worth doing if it stays honest: pick a couple of real peers (`difftastic`, `diff-so-fancy`) and say plainly what each does better. If it drifts toward marketing, cut it. Never a "replacement for X" claim.

## Launch presentation (optional, low priority)

Light-touch repo hygiene that helps a public repo present well. Do only what feels genuine — skip anything that reads as growth-hacking.

- [ ] GitHub repo description + topics set on `suiseki-cli`.
- [ ] Social preview image (the screenshot works) so shared links render a card.

## Out of scope

No growth-hacking, no inflated benchmarks, no "X killer" framing. The comparison table stays honest or gets cut. This plan is about presenting the tool clearly, not selling it.
