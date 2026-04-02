import { render } from "ink";
import React from "react";
import { detectProject } from "../detect.js";
import { parseNextjsLine, isNextjsCompileSuccess } from "../parsers/nextjs.js";
import { parseVercelLine, isVercelReady } from "../parsers/vercel.js";
import { startSupabaseProxy } from "../proxy.js";
import { startBrowserProxy } from "../browser-proxy.js";
import { startCollector } from "../collector.js";
import { App } from "../ui/App.js";
import { BugError } from "../types.js";

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
    if ((recentMessages.get(key) ?? 0) > now - 3000) return;
    recentMessages.set(key, now);
    errors.push(err);
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

  // stdin 파이프 감지 — next dev 2>&1 | bugside 로 실행한 경우
  const isPiped = !process.stdin.isTTY;
  if (isPiped) {
    process.stdin.setEncoding("utf-8");

    let buffer = "";
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        // ANSI 이스케이프 코드 + 캐리지 리턴 제거
        const line = rawLine
          .replace(/\x1b(\[[0-9;]*[A-Za-z]|[^[])/g, "")
          .replace(/\r/g, "");

        // 컴파일/준비 성공 → 해당 source 에러 클리어
        if (isNextjsCompileSuccess(line)) {
          if (errors.some((e) => e.source === "nextjs")) {
            errors.splice(0, errors.length, ...errors.filter((e) => e.source !== "nextjs"));
            rerender_();
          }
          continue;
        }
        if (isVercelReady(line)) {
          if (errors.some((e) => e.source === "vercel")) {
            errors.splice(0, errors.length, ...errors.filter((e) => e.source !== "vercel"));
            rerender_();
          }
          continue;
        }
        const err = parseNextjsLine(line) ?? parseVercelLine(line);
        if (err) pushError(err);
      }
    });

    process.stdin.on("end", () => process.exit(0));
  }
}
