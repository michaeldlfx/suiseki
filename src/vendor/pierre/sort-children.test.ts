import { describe, expect, test } from "bun:test"
import { compareTreeChildren } from "./sort-children"

describe("compareTreeChildren", () => {
  test("orders folders before files", () => {
    expect(
      compareTreeChildren(
        { name: "zzz", isDirectory: true },
        { name: "aaa", isDirectory: false },
      ),
    ).toBeLessThan(0)
  })

  test("orders dot-prefixed entries before others within the same kind", () => {
    expect(
      compareTreeChildren(
        { name: ".env", isDirectory: false },
        { name: "app.ts", isDirectory: false },
      ),
    ).toBeLessThan(0)
  })

  test("orders case-insensitively alphabetical within a subgroup", () => {
    expect(
      compareTreeChildren(
        { name: "apple", isDirectory: false },
        { name: "Zebra", isDirectory: false },
      ),
    ).toBeLessThan(0)
  })

  test("sorts an array folders-first, dotfiles-first, then alphabetical", () => {
    const entries = [
      { name: "main.ts", isDirectory: false },
      { name: "src", isDirectory: true },
      { name: ".github", isDirectory: true },
      { name: ".env", isDirectory: false },
    ]

    const sorted = [...entries].sort(compareTreeChildren).map((e) => e.name)

    expect(sorted).toEqual([".github", "src", ".env", "main.ts"])
  })
})
