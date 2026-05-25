import { describe, expect, test } from "bun:test"
import { fitToWidth, stripAnsi, visibleWidth } from "./ansi"

describe("ansi.ts", () => {
  describe("visibleWidth", () => {
    test("counts ascii as one column each", () => {
      expect(visibleWidth("hello")).toEqual(5)
    })

    test("counts CJK characters as two columns each", () => {
      expect(visibleWidth("日本語")).toEqual(6)
    })

    test("counts an emoji as two columns", () => {
      expect(visibleWidth("😀")).toEqual(2)
    })

    test("counts a combining mark as zero columns", () => {
      // "e" plus a combining acute accent (U+0301) renders in a single cell.
      expect(visibleWidth("é")).toEqual(1)
    })

    test("ignores ANSI escape sequences", () => {
      expect(visibleWidth("\x1b[31mred\x1b[0m")).toEqual(3)
    })
  })

  describe("fitToWidth", () => {
    test("pads a short ascii string to the target width", () => {
      const fitted = fitToWidth("ab", 5, true)

      expect(stripAnsi(fitted)).toEqual("ab   ")
      expect(visibleWidth(fitted)).toEqual(5)
    })

    test("truncates by display column rather than code units for CJK", () => {
      const fitted = fitToWidth("日本語", 4, false)

      expect(visibleWidth(fitted)).toEqual(4)
      expect(stripAnsi(fitted)).toContain("日本")
      expect(stripAnsi(fitted)).not.toContain("語")
    })

    test("drops a wide character that would overflow and pads the leftover cell", () => {
      const fitted = fitToWidth("a日", 2, true)

      expect(visibleWidth(fitted)).toEqual(2)
      expect(stripAnsi(fitted)).toContain("a")
      expect(stripAnsi(fitted)).not.toContain("日")
    })

    test("preserves ANSI escapes without counting them toward the width", () => {
      const fitted = fitToWidth("\x1b[31mabcdef\x1b[0m", 3, false)

      expect(visibleWidth(fitted)).toEqual(3)
      expect(stripAnsi(fitted)).toEqual("abc")
    })
  })
})
