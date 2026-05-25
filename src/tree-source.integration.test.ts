import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import assert from "node:assert"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { collectRevealPaths, resolveRepoContext } from "./tree-source"

async function git(args: string[], cwd: string): Promise<void> {
  await Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" })
    .exited
}

describe("tree-source.ts", () => {
  describe("collectRevealPaths", () => {
    describe("outside a git repository", () => {
      let root: string

      beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), "suiseki-reveal-"))
        await mkdir(join(root, "a", "deep"), { recursive: true })
        await mkdir(join(root, "collapsed-dir"))
        await writeFile(join(root, "top-file.ts"), "")
        await writeFile(join(root, "a", "other-in-a.ts"), "")
        await writeFile(join(root, "a", "deep", "target.ts"), "")
        await writeFile(join(root, "a", "deep", "sibling.ts"), "")
        await writeFile(join(root, "collapsed-dir", "hidden.ts"), "")
      })

      afterAll(async () => {
        await rm(root, { recursive: true, force: true })
      })

      test("lists direct children along the path and collapses siblings to markers", async () => {
        const paths = await collectRevealPaths({
          all: false,
          highlightPath: "a/deep/target.ts",
          repoContext: null,
          treeRoot: root,
        })

        expect(paths).toContain("a/deep/target.ts")
        expect(paths).toContain("a/deep/sibling.ts")
        expect(paths).toContain("a/other-in-a.ts")
        expect(paths).toContain("top-file.ts")
        expect(paths).toContain("collapsed-dir/")
        // The collapsed sibling directory is never walked into.
        expect(paths).not.toContain("collapsed-dir/hidden.ts")
      })
    })

    describe("inside a git repository", () => {
      let repoRoot: string

      beforeAll(async () => {
        // realpath so the path matches git's resolved toplevel (macOS /var ->
        // /private/var), keeping the repo context's subPrefix empty.
        repoRoot = await realpath(await mkdtemp(join(tmpdir(), "suiseki-rev-")))
        await git(["init"], repoRoot)
        await writeFile(join(repoRoot, ".gitignore"), "ignored-sibling.ts\n")
        await writeFile(join(repoRoot, "target.ts"), "")
        await writeFile(join(repoRoot, "tracked-sibling.ts"), "")
        await writeFile(join(repoRoot, "ignored-sibling.ts"), "")
      })

      afterAll(async () => {
        await rm(repoRoot, { recursive: true, force: true })
      })

      test("excludes gitignored siblings without --all", async () => {
        const repoContext = await resolveRepoContext(repoRoot)
        assert(repoContext != null, "repo context should resolve")

        const paths = await collectRevealPaths({
          all: false,
          highlightPath: "target.ts",
          repoContext,
          treeRoot: repoRoot,
        })

        expect(paths).toContain("target.ts")
        expect(paths).toContain("tracked-sibling.ts")
        expect(paths).not.toContain("ignored-sibling.ts")
      })

      test("includes gitignored siblings with --all", async () => {
        const repoContext = await resolveRepoContext(repoRoot)
        assert(repoContext != null, "repo context should resolve")

        const paths = await collectRevealPaths({
          all: true,
          highlightPath: "target.ts",
          repoContext,
          treeRoot: repoRoot,
        })

        expect(paths).toContain("ignored-sibling.ts")
      })
    })
  })
})
