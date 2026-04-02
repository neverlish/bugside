import { BugError } from "../types.js";
import { randomId } from "../utils.js";

// Next.js 컴파일 성공 감지 — true면 해당 source 에러 전부 제거
export function isNextjsCompileSuccess(line: string): boolean {
  return (
    line.includes("✓ Compiled") ||
    line.includes("✓ Ready") ||
    line.includes("compiled successfully") ||
    // Turbopack
    (line.includes("Compiled") && line.includes(" in "))
  );
}

// Next.js dev server stdout 라인을 파싱해서 에러 반환
// 에러가 아니면 null
export function parseNextjsLine(line: string): BugError | null {
  // 빌드 에러: "Type error:" or "./src/..." with error
  if (line.includes("Type error:") || line.includes("SyntaxError:")) {
    return makeError("nextjs", line, extractFileRef(line));
  }

  // App Router params 경고
  if (line.includes("params") && line.includes("Promise")) {
    return makeError(
      "nextjs",
      "params is a Promise — use React.use(params) or await params",
      "App Router params API changed in Next.js 15+",
      extractFileRef(line)
    );
  }

  // 하이드레이션 에러
  if (
    line.toLowerCase().includes("hydration") &&
    (line.toLowerCase().includes("error") || line.toLowerCase().includes("mismatch"))
  ) {
    return makeError("nextjs", "Hydration mismatch", line, extractFileRef(line));
  }

  // 런타임 에러: "Error: msg" 또는 "⨯ Error: msg" (Next.js 16 에러 심볼)
  if (/^[⨯✗×]?\s*(Error|TypeError|ReferenceError|RangeError):/.test(line.trim())) {
    return makeError("nextjs", line.replace(/^[⨯✗×]\s*/, "").trim(), undefined, extractFileRef(line));
  }

  // 빌드 실패
  if (line.includes("Failed to compile") || line.includes("Build error occurred")) {
    return makeError("nextjs", line.trim());
  }

  // Unhandled runtime error
  if (line.includes("Unhandled Runtime Error")) {
    return makeError("nextjs", line.trim());
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
