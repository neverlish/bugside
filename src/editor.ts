import { exec } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

function which(cmd: string): boolean {
  try {
    const { execSync } = require("child_process");
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function openInEditor(file: string, line?: number, cwd?: string) {
  const loc = line ? `${file}:${line}` : file;
  const absPath = cwd && !file.startsWith("/") ? join(cwd, file) : file;
  const absLoc = line ? `${absPath}:${line}` : absPath;

  // cursor > code > $EDITOR > open (macOS fallback)
  if (which("cursor")) {
    exec(`cursor --goto "${absLoc}"`);
  } else if (which("code")) {
    exec(`code --goto "${absLoc}"`);
  } else if (process.env.EDITOR) {
    exec(`${process.env.EDITOR} "${absLoc}"`);
  } else if (process.platform === "darwin") {
    exec(`open "${absPath}"`);
  }
}
