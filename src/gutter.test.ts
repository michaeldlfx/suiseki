import { describe, expect, test } from "bun:test"
import { stripAnsi } from "./ansi"
import { renderGutter } from "./gutter"

describe("gutter.ts", () => {
  describe("renderGutter", () => {
    test("renders line numbers and signs", () => {
      const gutter = renderGutter({
        lineNumber: 42,
        lineNumberWidth: 3,
        lineNumbers: true,
        sign: "+",
      })

      expect(stripAnsi(gutter.text)).toEqual("  42 +  ")
      expect(gutter.visibleLength).toEqual(8)
    })

    test("renders only signs when line numbers are disabled", () => {
      const gutter = renderGutter({
        lineNumber: 42,
        lineNumberWidth: 3,
        lineNumbers: false,
        sign: "-",
      })

      expect(stripAnsi(gutter.text)).toEqual("-  ")
      expect(gutter.visibleLength).toEqual(3)
    })
  })
})
