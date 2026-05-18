import { emitStyledText } from "./ansi"

export type ChangeMarker = "+" | "-" | "│" | " "

type RenderGutterParams = {
  backgroundColor?: string
  gutterForegroundColor: string
  lineNumber?: number
  lineNumberWidth: number
  lineNumbers: boolean
  marker: ChangeMarker
  markerForegroundColor: string
}

type RenderedGutter = {
  text: string
  visibleLength: number
}

export function renderGutter({
  backgroundColor,
  gutterForegroundColor,
  lineNumber,
  lineNumberWidth,
  lineNumbers,
  marker,
  markerForegroundColor,
}: RenderGutterParams): RenderedGutter {
  const lineNumberText =
    lineNumber == null
      ? " ".repeat(lineNumberWidth)
      : String(lineNumber).padStart(lineNumberWidth, " ")

  if (!lineNumbers) {
    return {
      text:
        emitStyledText({
          text: marker,
          foregroundColor: markerForegroundColor,
          backgroundColor,
        }) +
        emitStyledText({
          text: "  ",
          foregroundColor: gutterForegroundColor,
          backgroundColor,
        }),
      visibleLength: 3,
    }
  }

  return {
    text:
      emitStyledText({
        text: ` ${lineNumberText} `,
        foregroundColor: gutterForegroundColor,
        backgroundColor,
      }) +
      emitStyledText({
        text: marker,
        foregroundColor: markerForegroundColor,
        backgroundColor,
      }) +
      emitStyledText({
        text: "  ",
        foregroundColor: gutterForegroundColor,
        backgroundColor,
      }),
    visibleLength: lineNumberWidth + 5,
  }
}
