import { render } from "ink";
import React from "react";
import { exec } from "child_process";
import { detectProject } from "../detect.js";
import { parseNextjsLine, isNextjsCompileSuccess } from "../parsers/nextjs.js";
import { parseVercelLine, isVercelReady } from "../parsers/vercel.js";
import { startSupabaseProxy } from "../proxy.js";
import { startBrowserProxy } from "../browser-proxy.js";
import { startCollector } from "../collector.js";
import { appendHistory } from "../history.js";
import { App } from "../ui/App.js";
import { BugError } from "../types.js";

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin" ? `open "${url}"` :
    process.platform === "win32"  ? `start "${url}"` :
                                    `xdg-open "${url}"`;
  exec(cmd);
}

interface DevOptions {
  port: number;
}

export async function runDev({ port }: DevOptions) {
  const cwd = process.cwd();
  const config = detectProject(cwd);

  const errors: BugError[] = [];
  const recentMessages = new Map<string, number>();

  function rerender_() {
    rerender(
      React.createElement(App, {
        config,
        cwd,
        errors: [...errors],
        onClear: () => {
          errors.length = 0;
          rerender_();
        },
      })
    );
  }

  const { rerender } = render(
    React.createElement(App, {
      config,
      errors: [],
      onClear: () => {
        errors.length = 0;
        rerender_();
      },
    })
  );

  function pushError(err: BugError) {
    const key = `${err.source}:${err.message}`;
    const now = Date.now();
    if ((recentMessages.get(key) ?? 0) > now - 8000) return;
    recentMessages.set(key, now);
    errors.push(err);
    appendHistory([err]);
    rerender_();
  }

  // 브라우저 에러 수신 서버
  startCollector(pushError, () => {
    // 페이지 로드 → 브라우저/Supabase 에러 클리어
    const isBrowserError = (e: BugError) =>
      (e.source === "nextjs" && e.detail?.includes("browser")) || e.source === "supabase";
    if (errors.some(isBrowserError)) {
      errors.splice(0, errors.length, ...errors.filter((e) => !isBrowserError(e)));
      rerender_();
    }
  });

  // 브라우저 프록시 (:3001 → :port)
  startBrowserProxy(port);

  // Supabase 프록시
  if (config.hasSupabase && config.supabaseUrl) {
    startSupabaseProxy(config.supabaseUrl, pushError);
  }

  const proxyUrl = `http://localhost:${port + 1}`;
  let browserOpened = false;
  function openOnce() {
    if (browserOpened) return;
    browserOpened = true;
    openBrowser(proxyUrl);
  }

  // stdin 파이프 감지 — next dev 2>&1 | bugside 로 실행한 경우
  const isPiped = !process.stdin.isTTY;
  // 파이프/standalone 모두 최대 10초 안에 fallback으로 열기
  setTimeout(openOnce, isPiped ? 10000 : 3000);
  if (isPiped) {
    process.stdin.setEncoding("utf-8");

    let buffer = "";
    // 스택 트레이스에서 파일 위치 추출: "at fn (app/page.tsx:12:5)"
    function extractStackFile(line: string): { file: string; line: number } | undefined {
      const m = line.match(/at .+\(([^)]+\.(?:tsx?|jsx?))(?::(\d+))?/);
      if (!m) return undefined;
      // 절대경로 → 상대경로
      const file = m[1].replace(/^.*\/(?=(?:app|src|pages|components)\/)/,"");
      return { file, line: m[2] ? parseInt(m[2], 10) : 0 };
    }

    // 최근 push된 에러에 파일 위치 추가 (스택 트레이스 다음 줄용)
    let lastPushedIdx = -1;

    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        // ANSI 이스케이프 코드 + 캐리지 리턴 제거
        const line = rawLine
          .replace(/\x1b(\[[0-9;]*[A-Za-z]|[^[])/g, "")
          .replace(/\r/g, "");

        // 스택 트레이스 줄 — 직전 에러에 파일 위치 보강
        if (/^\s+at /.test(line) && lastPushedIdx >= 0 && !errors[lastPushedIdx]?.file) {
          const loc = extractStackFile(line);
          if (loc) {
            errors[lastPushedIdx].file = loc.file;
            errors[lastPushedIdx].line = loc.line;
            rerender_();
          }
          continue;
        }

        // 컴파일/준비 성공 → 해당 source 에러 클리어 + 브라우저 열기
        if (isNextjsCompileSuccess(line)) {
          openOnce();
          if (errors.some((e) => e.source === "nextjs")) {
            errors.splice(0, errors.length, ...errors.filter((e) => e.source !== "nextjs"));
            lastPushedIdx = -1;
            rerender_();
          }
          continue;
        }
        if (isVercelReady(line)) {
          openOnce();
          if (errors.some((e) => e.source === "vercel")) {
            errors.splice(0, errors.length, ...errors.filter((e) => e.source !== "vercel"));
            lastPushedIdx = -1;
            rerender_();
          }
          continue;
        }
        const err = parseNextjsLine(line) ?? parseVercelLine(line);
        if (err) {
          pushError(err);
          lastPushedIdx = errors.length - 1;
        } else {
          lastPushedIdx = -1;
        }
      }
    });

    process.stdin.on("end", () => process.exit(0));
  }
}
