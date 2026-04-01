import http from "http";
import httpProxy from "http-proxy";

const BROWSER_PROXY_PORT = 3001;
const COLLECTOR_PORT = 54321;

function injectedScript(): string {
  return `<script data-bugside>
(function() {
  var COLLECTOR = 'http://localhost:${COLLECTOR_PORT}';
  function send(type, message, source, lineno, colno, stack) {
    try {
      fetch(COLLECTOR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: type, message: message, source: source, lineno: lineno, colno: colno, stack: stack })
      }).catch(function(){});
    } catch(e) {}
  }
  var _error = console.error.bind(console);
  var _warn = console.warn.bind(console);
  console.error = function() { _error.apply(console, arguments); send('error', Array.from(arguments).map(String).join(' ')); };
  console.warn = function() { _warn.apply(console, arguments); send('warn', Array.from(arguments).map(String).join(' ')); };
  window.addEventListener('error', function(e) { send('error', e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function(e) { send('unhandledrejection', 'Unhandled Promise: ' + (e.reason instanceof Error ? e.reason.message : String(e.reason))); });
})();
</script>`;
}

export function startBrowserProxy(nextPort: number): { port: number; stop: () => void } {
  // HTML 주입용 프록시 (selfHandleResponse)
  const htmlProxy = httpProxy.createProxyServer({
    target: `http://localhost:${nextPort}`,
    selfHandleResponse: true,
  });

  // 일반 요청용 프록시 (pass-through)
  const passProxy = httpProxy.createProxyServer({
    target: `http://localhost:${nextPort}`,
  });

  htmlProxy.on("proxyRes", (proxyRes, _req, res) => {
    const serverRes = res as http.ServerResponse;
    const chunks: Buffer[] = [];

    proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const buf = Buffer.concat(chunks);
      let body = buf.toString("utf-8");

      // <head> 바로 뒤에 스크립트 주입
      body = body.replace("<head>", "<head>" + injectedScript());

      const headers = { ...proxyRes.headers };
      delete headers["content-length"];
      serverRes.writeHead(proxyRes.statusCode ?? 200, headers);
      serverRes.end(body);
    });
  });

  htmlProxy.on("error", (_err, _req, res) => {
    const serverRes = res as http.ServerResponse;
    if (!serverRes.headersSent) {
      serverRes.writeHead(502);
      serverRes.end("Bugside: Next.js not ready yet");
    }
  });

  passProxy.on("error", (_err, _req, res) => {
    const serverRes = res as http.ServerResponse;
    if (!serverRes.headersSent) {
      serverRes.writeHead(502);
      serverRes.end();
    }
  });

  const server = http.createServer((req, res) => {
    const contentType = req.headers["accept"] ?? "";
    const isHtmlRequest = contentType.includes("text/html");

    if (isHtmlRequest) {
      htmlProxy.web(req, res);
    } else {
      passProxy.web(req, res);
    }
  });

  // WebSocket 업그레이드 (Next.js HMR)
  server.on("upgrade", (req, socket, head) => {
    passProxy.ws(req, socket, head);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EADDRINUSE") {
      console.error(`[bugside] Browser proxy error: ${err.message}`);
    }
  });

  server.listen(BROWSER_PROXY_PORT);

  return {
    port: BROWSER_PROXY_PORT,
    stop: () => {
      server.close();
      htmlProxy.close();
      passProxy.close();
    },
  };
}
