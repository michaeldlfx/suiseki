import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { generateAnnotatedConfig } from "./config-command"

export type InitCommandIO = {
  promptOverwrite(targetPath: string): Promise<boolean>
}

export function getDefaultConfigPath(): string {
  const homeDirectory = Bun.env.HOME ?? homedir()
  return join(homeDirectory, ".suiseki", "config.toml")
}

type RunInitCommandWithIOParams = {
  targetPath: string
  io: InitCommandIO
}

export async function runInitCommandWithIO(
  params: RunInitCommandWithIOParams,
): Promise<void> {
  const { targetPath, io } = params

  const existingFile = Bun.file(targetPath)
  if (await existingFile.exists()) {
    const shouldOverwrite = await io.promptOverwrite(targetPath)
    if (!shouldOverwrite) {
      process.stdout.write("Aborted.\n")
      return
    }
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await Bun.write(targetPath, `${generateAnnotatedConfig()}\n`)
  process.stdout.write(`Created: ${targetPath}\n`)
}
