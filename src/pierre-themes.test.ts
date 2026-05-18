import { describe, expect, test } from "bun:test"
import { isPierreThemeName, PIERRE_THEMES } from "./pierre-themes"

describe("pierre-themes.ts", () => {
  describe("PIERRE_THEMES", () => {
    test("includes all four Pierre theme variants", () => {
      expect(Object.keys(PIERRE_THEMES).sort()).toEqual(
        [
          "pierre-dark",
          "pierre-dark-vibrant",
          "pierre-light",
          "pierre-light-vibrant",
        ].sort(),
      )
    })

    test("overrides each theme's display name with its kebab identifier", () => {
      for (const [identifier, theme] of Object.entries(PIERRE_THEMES)) {
        expect(theme.name).toEqual(identifier)
      }
    })

    test("each theme has a background and foreground color", () => {
      for (const theme of Object.values(PIERRE_THEMES)) {
        expect(theme.colors?.["editor.background"]).toBeString()
        expect(theme.colors?.["editor.foreground"]).toBeString()
      }
    })
  })

  describe("isPierreThemeName", () => {
    test("accepts a known Pierre theme name", () => {
      expect(isPierreThemeName("pierre-dark")).toEqual(true)
      expect(isPierreThemeName("pierre-light-vibrant")).toEqual(true)
    })

    test("rejects unknown theme names", () => {
      expect(isPierreThemeName("github-dark")).toEqual(false)
      expect(isPierreThemeName("not-a-theme")).toEqual(false)
    })
  })
})
