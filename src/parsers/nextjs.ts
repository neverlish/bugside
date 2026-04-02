import { BugError } from "../types.js";
import { randomId } from "../utils.js";

// Next.js log prefixes (from next/dist/esm/build/output/log.js):
//   error  → ⨯  (red bold)
//   warn   → ⚠  (yellow bold)
//   event  → ✓  (green bold)  ← compile success, ready
//   ready  → ▲

// 컴파일 성공 감지: ✓ 심볼 or 텍스트 fallback
export function isNextjsCompileSuccess(line: string): boolean {
  // ✓ Compiled in Xms (Turbopack), ✓ Compiled successfully in Xms (Webpack), ✓ Ready in Xms
  if (line.startsWith("✓ ") && (line.includes("Compiled") || line.includes("Ready"))) {
    return true;
  }
  // ANSI 미제거 환경 또는 구버전 fallback
  return line.includes("compiled successfully") || line.includes("Compiled successfully");
}

// Next.js dev server stdout 라인을 파싱해서 에러 반환
export function parseNextjsLine(line: string): BugError | null {
  // ⨯ 심볼로 시작하는 Next.js 에러 (런타임 에러, 빌드 에러 모두)
  if (line.startsWith("⨯ ")) {
    const msg = line.slice(2).trim();
    return makeError("nextjs", msg, undefined, extractFileRef(msg));
  }

  // ⚠ 심볼: 중요 경고만 포착 (params Promise, hydration)
  if (line.startsWith("⚠ ")) {
    const msg = line.slice(2).trim();
    if (msg.includes("params") && msg.includes("Promise")) {
      return makeError("nextjs", "params is a Promise — use React.use(params) or await params", msg);
    }
    if (msg.toLowerCase().includes("hydration")) {
      return makeError("nextjs", "Hydration mismatch", msg);
    }
    return null;
  }

  // 심볼 없는 빌드 에러 (Type error, Failed to compile — console.error로 직접 출력)
  if (line.includes("Type error:") || line.includes("Failed to compile")) {
    return makeError("nextjs", line.trim(), undefined, extractFileRef(line));
  }

  return null;
}

function makeError(
  source: "nextjs",
  message: string,
  detail?: string,
  fileRef?: { file: string; line?: number }
): BugError {
  return {
    id: randomId(),
    source,
    timestamp: new Date(),
    message: message.slice(0, 200),
    detail,
    file: fileRef?.file,
    line: fileRef?.line,
    resolved: false,
  };
}

function extractFileRef(line: string): { file: string; line?: number } | undefined {
  // 패턴: ./app/boards/page.tsx:12  또는  app/boards/page.tsx(12)
  const match =
    line.match(/([./\w-]+\.(tsx?|jsx?|css|scss))(?::(\d+))?/) ||
    line.match(/([./\w-]+\.(tsx?|jsx?|css|scss))\((\d+)\)/);

  if (!match) return undefined;

  return {
    file: match[1],
    line: match[3] ? parseInt(match[3], 10) : undefined,
  };
}
