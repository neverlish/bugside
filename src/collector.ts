import http from "http";
import { BugError } from "./types.js";
import { randomId } from "./utils.js";

const COLLECTOR_PORT = 54321;

interface BrowserErrorPayload {
  type: "error" | "warn" | "unhandledrejection" | "page-load" | "supabase-error" | "network-error";
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
}

export function startCollector(
  onError: (err: BugError) => void,
  onPageLoad?: () => void
): { stop: () => void } {
  const server = http.createServer((req, res) => {
    // CORS — next dev와 같은 origin이 아니므로 필요
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload: BrowserErrorPayload = JSON.parse(body);
        if (payload.type === "page-load") {
          onPageLoad?.();
        } else {
          const err = parseBrowserError(payload);
          if (err) onError(err);
        }
      } catch {
        // 파싱 실패 무시
      }
      res.writeHead(204);
      res.end();
    });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EADDRINUSE") {
      console.error(`[bugside] Collector error: ${err.message}`);
    }
  });

  server.listen(COLLECTOR_PORT);

  return { stop: () => server.close() };
}

function parseBrowserError(payload: BrowserErrorPayload): BugError | null {
  const { type, message, source, lineno, stack } = payload;

  if (!message) return null;

  // Supabase fetch 에러
  if (type === "supabase-error") {
    const rawDetail = stack ?? "";
    const detail = rawDetail.trimStart().startsWith("<") ? undefined : rawDetail.slice(0, 150) || undefined;
    return {
      id: randomId(),
      source: "supabase",
      timestamp: new Date(),
      message: message.slice(0, 200),
      detail,
      resolved: false,
    };
  }

  // 일반 HTTP 에러 (API routes, 외부 fetch 등)
  if (type === "network-error") {
    const rawDetail = stack ?? "";
    const detail = rawDetail.trimStart().startsWith("<") ? undefined : rawDetail.slice(0, 150) || undefined;
    return {
      id: randomId(),
      source: "network",
      timestamp: new Date(),
      message: message.slice(0, 200),
      detail,
      resolved: false,
    };
  }

  const isWarn = type === "warn";
  const file = source
    ? source.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "")
    : undefined;

  return {
    id: randomId(),
    source: "nextjs",
    timestamp: new Date(),
    message: message.slice(0, 200),
    detail: isWarn ? "(browser warning)" : "(browser error)",
    file,
    line: lineno,
    resolved: false,
  };
}
