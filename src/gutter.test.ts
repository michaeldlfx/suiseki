import { describe, expect, test } from "bun:test"
import { stripAnsi } from "./ansi"
import { renderGutter } from "./gutter"

const TEST_COLORS = {
  gutterForegroundColor: "#8b949e",
  markerForegroundColor: "#3fb950",
}

describe("gutter.ts", () => {
  describe("renderGutter", () => {
    test("renders line numbers and signs", () => {
      const gutter = renderGutter({
        ...TEST_COLORS,
        lineNumber: 42,
        lineNumberWidth: 3,
        lineNumbers: true,
        marker: "+",
      })

      expect(stripAnsi(gutter.text)).toEqual("  42 +  ")
      expect(gutter.visibleLength).toEqual(8)
    })

    test("renders only signs when line numbers are disabled", () => {
      const gutter = renderGutter({
        ...TEST_COLORS,
        lineNumber: 42,
        lineNumberWidth: 3,
        lineNumbers: false,
        marker: "-",
      })

      expect(stripAnsi(gutter.text)).toEqual("-  ")
      expect(gutter.visibleLength).toEqual(3)
    })
  })
})
