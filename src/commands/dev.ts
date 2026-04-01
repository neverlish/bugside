import { spawn } from "child_process";
import { render } from "ink";
import React from "react";
import { detectProject } from "../detect.js";
import { parseNextjsLine } from "../parsers/nextjs.js";
import { parseVercelLine } from "../parsers/vercel.js";
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

  // TODO: Supabase proxy (src/proxy.ts)
  // TODO: Vercel dev spawn + parseVercelLine
}
