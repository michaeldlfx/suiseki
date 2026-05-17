import { describe, expect, test } from "bun:test"
import { parseColor } from "./color"

describe("color.ts", () => {
  describe("parseColor", () => {
    test("parses 3-character hex", () => {
      expect(parseColor("#abc")).toEqual({
        red: 0xaa,
        green: 0xbb,
        blue: 0xcc,
        alpha: 1,
      })
    })

    test("parses 6-character hex", () => {
      expect(parseColor("#ff0080")).toEqual({
        red: 255,
        green: 0,
        blue: 128,
        alpha: 1,
      })
    })

    test("parses 8-character hex with alpha", () => {
      expect(parseColor("#ff008040")).toEqual({
        red: 255,
        green: 0,
        blue: 128,
        alpha: 64 / 255,
      })
    })

    test("converts display-p3 white to sRGB white", () => {
      const parsed = parseColor("color(display-p3 1 1 1)")
      expect(parsed).toEqual({ red: 255, green: 255, blue: 255, alpha: 1 })
    })

    test("converts display-p3 black to sRGB black", () => {
      const parsed = parseColor("color(display-p3 0 0 0)")
      expect(parsed).toEqual({ red: 0, green: 0, blue: 0, alpha: 1 })
    })

    test("preserves pierre-dark background through round-trip", () => {
      // pierre-dark-vibrant's editor.background is the p3 equivalent of #070707
      const parsed = parseColor("color(display-p3 0.027451 0.027451 0.027451)")
      expect(parsed?.red).toEqual(7)
      expect(parsed?.green).toEqual(7)
      expect(parsed?.blue).toEqual(7)
    })

    test("converts saturated display-p3 red to in-gamut sRGB", () => {
      // Pure p3 red is out-of-gamut for sRGB; we clamp to a valid red.
      const parsed = parseColor("color(display-p3 1 0 0)")
      expect(parsed?.red).toEqual(255)
      expect(parsed?.green).toEqual(0)
      expect(parsed?.blue).toEqual(0)
      expect(parsed?.alpha).toEqual(1)
    })

    test("parses display-p3 alpha when present", () => {
      const parsed = parseColor("color(display-p3 0 0 0 / 0.5)")
      expect(parsed?.alpha).toEqual(0.5)
    })

    test("returns undefined for unsupported color syntax", () => {
      expect(parseColor("color(srgb 1 0 0)")).toEqual(undefined)
      expect(parseColor("rgb(255 0 0)")).toEqual(undefined)
      expect(parseColor("red")).toEqual(undefined)
      expect(parseColor("")).toEqual(undefined)
    })

    test("returns undefined for invalid hex", () => {
      expect(parseColor("#xyz")).toEqual(undefined)
      expect(parseColor("#1234")).toEqual(undefined)
    })
  })
})
