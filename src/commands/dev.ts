import { spawn } from "child_process";
import { render } from "ink";
import React from "react";
import { detectProject } from "../detect.js";
import { parseNextjsLine } from "../parsers/nextjs.js";
import { parseVercelLine } from "../parsers/vercel.js";
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

  const { rerender, unmount } = render(
    React.createElement(App, {
      config,
      errors: [...errors],
      onClear: () => {
        errors.length = 0;
        rerender(React.createElement(App, { config, errors: [], onClear: () => {} }));
      },
    })
  );

  function pushError(err: BugError) {
    errors.push(err);
    rerender(
      React.createElement(App, {
        config,
        errors: [...errors],
        onClear: () => {
          errors.length = 0;
          rerender(React.createElement(App, { config, errors: [], onClear: () => {} }));
        },
      })
    );
  }

  // 브라우저 에러 수신 서버 (항상 시작)
  startCollector(pushError);

  // 브라우저 프록시 (HTML에 스크립트 주입, :3001 → :port)
  if (config.hasNextjs) {
    startBrowserProxy(port);
  }

  // Next.js dev server spawn
  if (config.hasNextjs) {
    const nextProcess = spawn("npx", ["next", "dev", "--port", String(port)], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    nextProcess.stdout.setEncoding("utf-8");
    nextProcess.stderr.setEncoding("utf-8");

    const handleLine = (line: string) => {
      const err = parseNextjsLine(line);
      if (err) pushError(err);
    };

    let buffer = "";
    const onData = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    };

    nextProcess.stdout.on("data", onData);
    nextProcess.stderr.on("data", onData);

    nextProcess.on("exit", () => unmount());
  }

  // Supabase 프록시
  if (config.hasSupabase && config.supabaseUrl) {
    startSupabaseProxy(config.supabaseUrl, pushError);
  }

  // Vercel dev spawn
  if (config.hasVercel) {
    const vercelProcess = spawn("npx", ["vercel", "dev"], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    vercelProcess.stdout.setEncoding("utf-8");
    vercelProcess.stderr.setEncoding("utf-8");

    const handleVercelLine = (line: string) => {
      const err = parseVercelLine(line);
      if (err) pushError(err);
    };

    let vercelBuffer = "";
    const onVercelData = (chunk: string) => {
      vercelBuffer += chunk;
      const lines = vercelBuffer.split("\n");
      vercelBuffer = lines.pop() ?? "";
      for (const line of lines) handleVercelLine(line);
    };

    vercelProcess.stdout.on("data", onVercelData);
    vercelProcess.stderr.on("data", onVercelData);
  }
}
