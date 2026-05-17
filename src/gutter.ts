import { emitStyledText } from "./ansi"

export type ChangeSign = "+" | "-" | " "

type RenderGutterParams = {
  backgroundColor?: string
  lineNumber?: number
  lineNumberWidth: number
  lineNumbers: boolean
  sign: ChangeSign
}

type RenderedGutter = {
  text: string
  visibleLength: number
}

const GUTTER_FOREGROUND_COLOR = "#8b949e"
const ADDITION_SIGN_COLOR = "#3fb950"
const DELETION_SIGN_COLOR = "#f85149"

export function renderGutter({
  backgroundColor,
  lineNumber,
  lineNumberWidth,
  lineNumbers,
  sign,
}: RenderGutterParams): RenderedGutter {
  const lineNumberText =
    lineNumber == null
      ? " ".repeat(lineNumberWidth)
      : String(lineNumber).padStart(lineNumberWidth, " ")

  if (!lineNumbers) {
    return {
      text:
        emitStyledText({
          text: sign,
          foregroundColor: getSignColor(sign),
          backgroundColor,
        }) +
        emitStyledText({
          text: "  ",
          foregroundColor: GUTTER_FOREGROUND_COLOR,
          backgroundColor,
        }),
      visibleLength: 3,
    }
  }

  return {
    text:
      emitStyledText({
        text: ` ${lineNumberText} `,
        foregroundColor: GUTTER_FOREGROUND_COLOR,
        backgroundColor,
      }) +
      emitStyledText({
        text: sign,
        foregroundColor: getSignColor(sign),
        backgroundColor,
      }) +
      emitStyledText({
        text: "  ",
        foregroundColor: GUTTER_FOREGROUND_COLOR,
        backgroundColor,
      }),
    visibleLength: lineNumberWidth + 5,
  }
}

function getSignColor(sign: ChangeSign): string {
  if (sign === "+") {
    return ADDITION_SIGN_COLOR
  }

  if (sign === "-") {
    return DELETION_SIGN_COLOR
  }

  return GUTTER_FOREGROUND_COLOR
}
