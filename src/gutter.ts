import { emitStyledText } from "./ansi"

export type ChangeSign = "+" | "-" | " "

type RenderGutterParams = {
  additionSignColor: string
  backgroundColor?: string
  deletionSignColor: string
  gutterForegroundColor: string
  lineNumber?: number
  lineNumberWidth: number
  lineNumbers: boolean
  sign: ChangeSign
}

type RenderedGutter = {
  text: string
  visibleLength: number
}

export function renderGutter({
  additionSignColor,
  backgroundColor,
  deletionSignColor,
  gutterForegroundColor,
  lineNumber,
  lineNumberWidth,
  lineNumbers,
  sign,
}: RenderGutterParams): RenderedGutter {
  const lineNumberText =
    lineNumber == null
      ? " ".repeat(lineNumberWidth)
      : String(lineNumber).padStart(lineNumberWidth, " ")

  const signColor = getSignColor({
    additionSignColor,
    deletionSignColor,
    gutterForegroundColor,
    sign,
  })

  if (!lineNumbers) {
    return {
      text:
        emitStyledText({
          text: sign,
          foregroundColor: signColor,
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
        text: sign,
        foregroundColor: signColor,
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

type GetSignColorParams = {
  additionSignColor: string
  deletionSignColor: string
  gutterForegroundColor: string
  sign: ChangeSign
}

function getSignColor({
  additionSignColor,
  deletionSignColor,
  gutterForegroundColor,
  sign,
}: GetSignColorParams): string {
  if (sign === "+") {
    return additionSignColor
  }

  if (sign === "-") {
    return deletionSignColor
  }

  return gutterForegroundColor
}
