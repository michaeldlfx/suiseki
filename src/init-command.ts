import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { generateAnnotatedConfig } from "./config-command"

export type InitCommandIO = {
  promptPathChoice(): Promise<string>
  promptOverwrite(targetPath: string): Promise<boolean>
}

export function getInitPathCandidates(): [string, string] {
  const homeDirectory = Bun.env.HOME ?? homedir()
  const xdgConfigHome =
    Bun.env.XDG_CONFIG_HOME != null && Bun.env.XDG_CONFIG_HOME !== ""
      ? Bun.env.XDG_CONFIG_HOME
      : join(homeDirectory, ".config")
  return [
    join(xdgConfigHome, "suiseki", "config.toml"),
    join(homeDirectory, ".suiseki", "config.toml"),
  ]
}

export async function runInitCommandWithIO(io: InitCommandIO): Promise<void> {
  const targetPath = await io.promptPathChoice()

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
