import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { BugError } from "./types.js";

const DIR = join(homedir(), ".bugside");
const FILE = join(DIR, "history.json");
const MAX = 200;

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

export function loadHistory(): BugError[] {
  try {
    ensureDir();
    if (!existsSync(FILE)) return [];
    const raw = readFileSync(FILE, "utf-8");
    const parsed = JSON.parse(raw) as Array<BugError & { timestamp: string }>;
    return parsed.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));
  } catch {
    return [];
  }
}

export function appendHistory(errors: BugError[]) {
  try {
    ensureDir();
    const existing = loadHistory();
    const merged = [...existing, ...errors].slice(-MAX);
    writeFileSync(FILE, JSON.stringify(merged, null, 2), "utf-8");
  } catch {
    // 히스토리 저장 실패는 무시
  }
}
