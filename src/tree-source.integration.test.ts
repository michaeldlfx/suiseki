import { afterAll, describe, expect, test } from "bun:test"
import assert from "node:assert"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  collectRevealPaths,
  collectTreePaths,
  loadGitStatus,
  resolveRepoContext,
} from "./tree-source"

const createdDirs: string[] = []

afterAll(async () => {
  for (const dir of createdDirs) {
    await rm(dir, { recursive: true, force: true })
  }
})

async function git(args: string[], cwd: string): Promise<void> {
  await Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" })
    .exited
}

// realpath so the path matches git's resolved toplevel (macOS /var ->
// /private/var), keeping subPrefix empty for a repo-root tree root.
async function tempDir(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  createdDirs.push(dir)
  return dir
}

async function initRepo(prefix: string): Promise<string> {
  const root = await tempDir(prefix)
  await git(["init"], root)
  await git(["config", "user.email", "test@example.com"], root)
  await git(["config", "user.name", "suiseki test"], root)
  return root
}

describe("tree-source.ts", () => {
  describe("resolveRepoContext", () => {
    test("returns the repo root with an empty subPrefix at the top level", async () => {
      const root = await initRepo("suiseki-ctx-")

      const context = await resolveRepoContext(root)

      assert(context != null, "context should resolve")
      expect(context.repoRoot).toEqual(root)
      expect(context.subPrefix).toEqual("")
    })

    test("returns a trailing-slash subPrefix for a subdirectory", async () => {
      const root = await initRepo("suiseki-ctx-")
      await mkdir(join(root, "pkg", "inner"), { recursive: true })

      const context = await resolveRepoContext(join(root, "pkg", "inner"))

      assert(context != null, "context should resolve")
      expect(context.repoRoot).toEqual(root)
      expect(context.subPrefix).toEqual("pkg/inner/")
    })

    test("returns null outside a git repository", async () => {
      const dir = await tempDir("suiseki-noctx-")

      expect(await resolveRepoContext(dir)).toEqual(null)
    })
  })

  describe("collectTreePaths", () => {
    test("hidden mode lists tracked and untracked files but excludes gitignored ones", async () => {
      const root = await initRepo("suiseki-paths-")
      await writeFile(join(root, ".gitignore"), "ignored.ts\n")
      await writeFile(join(root, "tracked.ts"), "")
      await writeFile(join(root, "untracked.ts"), "")
      await writeFile(join(root, "ignored.ts"), "")
      const context = await resolveRepoContext(root)
      assert(context != null, "context should resolve")

      const { paths } = await collectTreePaths({
        gitignored: "hidden",
        repoContext: context,
        showHidden: true,
        treeRoot: root,
      })

      expect(paths).toContain("tracked.ts")
      expect(paths).toContain("untracked.ts")
      expect(paths).not.toContain("ignored.ts")
    })

    test("expanded mode includes gitignored files in full", async () => {
      const root = await initRepo("suiseki-paths-")
      await writeFile(join(root, ".gitignore"), "ignored/\n")
      await mkdir(join(root, "ignored"))
      await writeFile(join(root, "ignored", "deep.ts"), "")
      const context = await resolveRepoContext(root)
      assert(context != null, "context should resolve")

      const { paths } = await collectTreePaths({
        gitignored: "expanded",
        repoContext: context,
        showHidden: true,
        treeRoot: root,
      })

      expect(paths).toContain("ignored/deep.ts")
    })

    test("collapsed mode shows ignored dirs as markers without their contents", async () => {
      const root = await initRepo("suiseki-collapse-")
      await writeFile(join(root, ".gitignore"), "ignored/\n")
      await mkdir(join(root, "ignored"))
      await writeFile(join(root, "ignored", "deep.ts"), "")
      await writeFile(join(root, "tracked.ts"), "")
      const context = await resolveRepoContext(root)
      assert(context != null, "context should resolve")

      const { paths, collapsedDirectories } = await collectTreePaths({
        gitignored: "collapsed",
        repoContext: context,
        showHidden: true,
        treeRoot: root,
      })

      expect(paths).toContain("tracked.ts")
      expect(paths).toContain("ignored/")
      // The collapsed marker, not the contents.
      expect(paths).not.toContain("ignored/deep.ts")
      expect(collapsedDirectories.has("ignored/")).toEqual(true)
    })

    test("a gitignored tree root shows its own contents (root override)", async () => {
      const root = await initRepo("suiseki-root-")
      await writeFile(join(root, ".gitignore"), "ignored/\n")
      await mkdir(join(root, "ignored"))
      await writeFile(join(root, "ignored", "inside.ts"), "")
      const context = await resolveRepoContext(join(root, "ignored"))
      assert(context != null, "context should resolve")

      const { paths } = await collectTreePaths({
        gitignored: "collapsed",
        repoContext: context,
        showHidden: true,
        treeRoot: join(root, "ignored"),
      })

      // Pointing at the ignored dir shows what's inside it.
      expect(paths).toContain("inside.ts")
    })

    test("reconciles repo paths to a subdirectory tree root", async () => {
      const root = await initRepo("suiseki-sub-")
      await mkdir(join(root, "pkg", "inner"), { recursive: true })
      await writeFile(join(root, "pkg", "inner", "in.ts"), "")
      await writeFile(join(root, "pkg", "sibling.ts"), "")
      await writeFile(join(root, "outside.ts"), "")
      const context = await resolveRepoContext(join(root, "pkg"))
      assert(context != null, "context should resolve")

      const { paths } = await collectTreePaths({
        gitignored: "hidden",
        repoContext: context,
        showHidden: true,
        treeRoot: join(root, "pkg"),
      })

      // Paths are reconciled to the tree root: the "pkg/" prefix is stripped, and
      // a file outside the tree root drops out entirely.
      expect(paths).toContain("inner/in.ts")
      expect(paths).toContain("sibling.ts")
      expect(paths).not.toContain("outside.ts")
    })

    test("walks the filesystem outside a repo, hiding dotfiles unless shown", async () => {
      const dir = await tempDir("suiseki-walk-")
      await mkdir(join(dir, "sub"))
      await writeFile(join(dir, "a.ts"), "")
      await writeFile(join(dir, "sub", "b.ts"), "")
      await writeFile(join(dir, ".hidden"), "")

      const withoutHidden = await collectTreePaths({
        gitignored: "collapsed",
        repoContext: null,
        showHidden: false,
        treeRoot: dir,
      })
      expect(withoutHidden.paths).toContain("a.ts")
      expect(withoutHidden.paths).toContain("sub/b.ts")
      expect(withoutHidden.paths).not.toContain(".hidden")

      const withHidden = await collectTreePaths({
        gitignored: "collapsed",
        repoContext: null,
        showHidden: true,
        treeRoot: dir,
      })
      expect(withHidden.paths).toContain(".hidden")
    })
  })

  describe("loadGitStatus", () => {
    test("maps porcelain statuses and rolls changes up to ancestor directories", async () => {
      const root = await initRepo("suiseki-status-")
      await mkdir(join(root, "dir"))
      await writeFile(join(root, "mod.ts"), "one\n")
      await writeFile(join(root, "del.ts"), "")
      await writeFile(join(root, "ren.ts"), "")
      await writeFile(join(root, "dir", "nested.ts"), "one\n")
      await git(["add", "-A"], root)
      await git(["commit", "-m", "baseline"], root)

      await writeFile(join(root, "mod.ts"), "two\n")
      await rm(join(root, "del.ts"))
      await git(["mv", "ren.ts", "renamed.ts"], root)
      await writeFile(join(root, "new.ts"), "")
      await writeFile(join(root, "dir", "nested.ts"), "two\n")

      const context = await resolveRepoContext(root)
      assert(context != null, "context should resolve")
      const status = await loadGitStatus({
        includeIgnored: false,
        repoContext: context,
      })

      assert(status != null, "status should be present")
      expect(status.statusByPath.get("mod.ts")).toEqual("modified")
      expect(status.statusByPath.get("del.ts")).toEqual("deleted")
      expect(status.statusByPath.get("renamed.ts")).toEqual("renamed")
      expect(status.statusByPath.get("new.ts")).toEqual("untracked")
      expect(status.statusByPath.get("dir/nested.ts")).toEqual("modified")
      expect(status.directoriesWithChanges.has("dir/")).toEqual(true)
    })

    test("returns null for a clean repository", async () => {
      const root = await initRepo("suiseki-clean-")
      await writeFile(join(root, "a.ts"), "")
      await git(["add", "-A"], root)
      await git(["commit", "-m", "baseline"], root)
      const context = await resolveRepoContext(root)
      assert(context != null, "context should resolve")

      const status = await loadGitStatus({
        includeIgnored: false,
        repoContext: context,
      })

      expect(status).toEqual(null)
    })

    test("returns null outside a repository", async () => {
      const status = await loadGitStatus({
        includeIgnored: false,
        repoContext: null,
      })

      expect(status).toEqual(null)
    })
  })

  describe("collectRevealPaths", () => {
    test("lists direct children along the path and collapses siblings to markers", async () => {
      const root = await tempDir("suiseki-reveal-")
      await mkdir(join(root, "a", "deep"), { recursive: true })
      await mkdir(join(root, "collapsed-dir"))
      await writeFile(join(root, "top-file.ts"), "")
      await writeFile(join(root, "a", "other-in-a.ts"), "")
      await writeFile(join(root, "a", "deep", "target.ts"), "")
      await writeFile(join(root, "a", "deep", "sibling.ts"), "")
      await writeFile(join(root, "collapsed-dir", "hidden.ts"), "")

      const paths = await collectRevealPaths({
        gitignored: "collapsed",
        highlightPath: "a/deep/target.ts",
        repoContext: null,
        showHidden: true,
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

    test("hidden mode excludes gitignored siblings; collapsed keeps them", async () => {
      const root = await initRepo("suiseki-reveal-repo-")
      await writeFile(join(root, ".gitignore"), "ignored-sibling.ts\n")
      await writeFile(join(root, "target.ts"), "")
      await writeFile(join(root, "tracked-sibling.ts"), "")
      await writeFile(join(root, "ignored-sibling.ts"), "")
      const context = await resolveRepoContext(root)
      assert(context != null, "context should resolve")

      const hidden = await collectRevealPaths({
        gitignored: "hidden",
        highlightPath: "target.ts",
        repoContext: context,
        showHidden: true,
        treeRoot: root,
      })
      expect(hidden).toContain("target.ts")
      expect(hidden).toContain("tracked-sibling.ts")
      expect(hidden).not.toContain("ignored-sibling.ts")

      const collapsed = await collectRevealPaths({
        gitignored: "collapsed",
        highlightPath: "target.ts",
        repoContext: context,
        showHidden: true,
        treeRoot: root,
      })
      expect(collapsed).toContain("ignored-sibling.ts")
    })
  })
})
