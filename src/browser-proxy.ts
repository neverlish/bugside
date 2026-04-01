import http from "http";
import httpProxy from "http-proxy";

const BROWSER_PROXY_PORT = 3001;
const COLLECTOR_PORT = 54321;

// 브라우저에 주입할 에러 리포터 스크립트
function injectedScript(): string {
  return `
<script data-bugside>
(function() {
  var COLLECTOR = 'http://localhost:${COLLECTOR_PORT}';
  function send(type, message, source, lineno, colno, stack) {
    try {
      fetch(COLLECTOR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message, source, lineno, colno, stack })
      }).catch(function(){});
    } catch(e) {}
  }

  // console.error / console.warn 인터셉트
  var _error = console.error.bind(console);
  var _warn = console.warn.bind(console);
  console.error = function() {
    _error.apply(console, arguments);
    send('error', Array.from(arguments).map(String).join(' '));
  };
  console.warn = function() {
    _warn.apply(console, arguments);
    send('warn', Array.from(arguments).map(String).join(' '));
  };

  // 언핸들드 JS 에러
  window.addEventListener('error', function(e) {
    send('error', e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
  });

  // 언핸들드 Promise rejection
  window.addEventListener('unhandledrejection', function(e) {
    var msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    send('unhandledrejection', 'Unhandled Promise rejection: ' + msg);
  });
})();
</script>`;
}

export function startBrowserProxy(nextPort: number): { port: number; stop: () => void } {
  const proxy = httpProxy.createProxyServer({
    target: `http://localhost:${nextPort}`,
    selfHandleResponse: true,
  });

  proxy.on("proxyRes", (proxyRes, _req, res) => {
    const serverRes = res as http.ServerResponse;
    const contentType = proxyRes.headers["content-type"] ?? "";
    const isHtml = contentType.includes("text/html");

    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
    proxyRes.on("end", () => {
      let body = Buffer.concat(chunks).toString("utf-8");

      if (isHtml) {
        // <head> 바로 뒤에 스크립트 주입
        body = body.replace("<head>", "<head>" + injectedScript());
        // content-length 제거 (body 길이 바뀌므로)
        const headers = { ...proxyRes.headers };
        delete headers["content-length"];
        serverRes.writeHead(proxyRes.statusCode ?? 200, headers);
      } else {
        serverRes.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      }

      serverRes.end(body);
    });
  });

  proxy.on("error", (_err, _req, res) => {
    const serverRes = res as http.ServerResponse;
    if (!serverRes.headersSent) {
      serverRes.writeHead(502);
      serverRes.end("Bugside browser proxy error");
    }
  });

  const server = http.createServer((req, res) => {
    proxy.web(req, res);
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
      proxy.close();
    },
  };
}
