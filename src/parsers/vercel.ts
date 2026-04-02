import { BugError } from "../types.js";
import { randomId } from "../utils.js";

// vercel dev 성공/준비 상태 감지
export function isVercelReady(line: string): boolean {
  return line.includes("Ready!") || line.includes("Available at");
}

export function parseVercelLine(line: string): BugError | null {
  // vercel dev 런타임 에러: "> Error! [GET] /path | Error: message"
  const funcErrorMatch = line.match(/>\s*Error!\s*\[(\w+)\]\s*(\S+)\s*\|\s*(.+)/);
  if (funcErrorMatch) {
    const [, method, path, msg] = funcErrorMatch;
    return makeError(`[${method}] ${path} — ${msg.trim()}`, undefined, extractFileRef(msg));
  }

  // 빌드 실패
  if (line.includes("Error!") && line.includes("Build")) {
    return makeError("Build failed", line);
  }

  if (line.includes("Build failed")) {
    return makeError("Build failed", extractBuildDetail(line));
  }

  // TypeScript 에러
  if (/Type '.*' is not assignable/.test(line)) {
    return makeError(line.trim(), undefined, extractFileRef(line));
  }

  // 환경변수 누락
  if (
    line.includes("env") &&
    (line.includes("undefined") || line.includes("missing") || line.includes("not found"))
  ) {
    return makeError("Missing environment variable", line.trim());
  }

  // 함수 타임아웃
  if (line.includes("FUNCTION_INVOCATION_TIMEOUT") || line.includes("Task timed out")) {
    return makeError("Function timeout", line.trim());
  }

  // Next.js/vercel dev 런타임 에러: "⨯ Error: message" 또는 " Error: message"
  if (/^[⨯✗×]?\s*(Error|TypeError|ReferenceError|RangeError):/.test(line.trim())) {
    return makeError(line.replace(/^[⨯✗×]\s*/, "").trim(), undefined, extractFileRef(line));
  }

  // HTTP 5xx 에러: " GET /path 500 in Xms"
  const httpErrorMatch = line.match(/^\s*(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s+(5\d\d)\s+in/);
  if (httpErrorMatch) {
    const [, method, path, status] = httpErrorMatch;
    return makeError(`[${method}] ${path} — HTTP ${status}`);
  }

  return null;
}

function makeError(
  message: string,
  detail?: string,
  fileRef?: { file: string; line?: number }
): BugError {
  return {
    id: randomId(),
    source: "vercel",
    timestamp: new Date(),
    message: message.slice(0, 200),
    detail,
    file: fileRef?.file,
    line: fileRef?.line,
    resolved: false,
  };
}

function extractBuildDetail(line: string): string {
  return line
    .replace(/^\[.*?\]\s*/, "")
    .replace(/^Error!?\s*/i, "")
    .trim()
    .slice(0, 150);
}

function extractFileRef(line: string): { file: string; line?: number } | undefined {
  const match = line.match(/([./\w-]+\.(tsx?|jsx?|css|scss))(?::(\d+))?/);
  if (!match) return undefined;
  return {
    file: match[1],
    line: match[3] ? parseInt(match[3], 10) : undefined,
  };
}
