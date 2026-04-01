import http from "http";
import httpProxy from "http-proxy";
import { parseSupabaseResponse } from "./parsers/supabase.js";
import { BugError } from "./types.js";

const PROXY_PORT = 54320;

export function startSupabaseProxy(
  targetUrl: string,
  onError: (err: BugError) => void
): { port: number; stop: () => void } {
  const proxy = httpProxy.createProxyServer({
    target: targetUrl,
    changeOrigin: true,
    selfHandleResponse: true,
  });

  proxy.on("proxyRes", (proxyRes, req, res) => {
    const chunks: Buffer[] = [];

    proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      const statusCode = proxyRes.statusCode ?? 0;

      const parsed = parseSupabaseResponse({
        method: req.method ?? "GET",
        path: req.url ?? "/",
        statusCode,
        responseBody: body,
      });
      if (parsed) onError(parsed);

      (res as http.ServerResponse).writeHead(statusCode, proxyRes.headers);
      (res as http.ServerResponse).end(body);
    });
  });

  proxy.on("error", (err, _req, res) => {
    (res as http.ServerResponse).writeHead(502);
    (res as http.ServerResponse).end(`Bugside proxy error: ${err.message}`);
  });

  const server = http.createServer((req, res) => {
    proxy.web(req, res);
  });

  server.listen(PROXY_PORT);

  return {
    port: PROXY_PORT,
    stop: () => {
      server.close();
      proxy.close();
    },
  };
}
