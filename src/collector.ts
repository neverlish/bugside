import http from "http";
import { BugError } from "./types.js";
import { randomId } from "./utils.js";

const COLLECTOR_PORT = 54321;

interface BrowserErrorPayload {
  type: "error" | "warn" | "unhandledrejection" | "page-load";
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
  const { type, message, source, lineno } = payload;

  if (!message) return null;

  // React key prop 경고 등 무시하고 싶으면 여기서 필터
  const isWarn = type === "warn";

  // 파일 경로 추출 (source는 full URL일 수 있음)
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
