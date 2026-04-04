import React, { useState } from "react";
import { Box, Text, useInput, useApp, useStdin, useStdout } from "ink";
import { BugError, ProjectConfig } from "../types.js";
import { ErrorCard } from "./ErrorCard.js";
import { openInEditor } from "../editor.js";

interface Props {
  config: ProjectConfig;
  errors: BugError[];
  onClear: () => void;
  cwd: string;
}

function KeyboardHandler({
  onClear,
  errors,
  selectedIdx,
  setSelectedIdx,
  cwd,
}: {
  onClear: () => void;
  errors: BugError[];
  selectedIdx: number;
  setSelectedIdx: (i: number) => void;
  cwd: string;
}) {
  const { exit } = useApp();
  useInput((input, key) => {
    if (input === "q") exit();
    if (input === "c") onClear();
    if (key.upArrow) setSelectedIdx(Math.max(0, selectedIdx - 1));
    if (key.downArrow) setSelectedIdx(Math.min(errors.length - 1, selectedIdx + 1));
    if (key.return) {
      const err = errors[selectedIdx];
      if (err?.file) openInEditor(err.file, err.line, cwd);
    }
  });
  return null;
}

// 에러 카드 한 장당 최소 줄 수 (border 2 + source/time 1 + message 1 + marginBottom 1)
const LINES_PER_CARD = 5;
// 헤더(3) + 상태바(2) + 패딩(2)
const FIXED_OVERHEAD = 7;

export function App({ config, errors, onClear, cwd }: Props) {
  const { isRawModeSupported } = useStdin();
  const { stdout } = useStdout();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const rows = stdout.rows ?? 24;
  const maxVisible = Math.max(1, Math.floor((rows - FIXED_OVERHEAD) / LINES_PER_CARD));
  const visibleErrors = errors.slice(-maxVisible);
  const hiddenCount = errors.length - visibleErrors.length;
  const visibleStartIdx = errors.length - visibleErrors.length;

  const unresolvedCount = errors.filter((e) => !e.resolved).length;

  const sources = [
    config.hasNextjs && "Next.js",
    config.hasSupabase && "Supabase",
    config.hasVercel && "Vercel",
  ].filter(Boolean) as string[];

  const clampedSelected = Math.min(selectedIdx, Math.max(0, errors.length - 1));

  return (
    <Box flexDirection="column" height={rows} paddingX={1} paddingTop={1} overflow="hidden">
      {isRawModeSupported && (
        <KeyboardHandler
          onClear={onClear}
          errors={errors}
          selectedIdx={clampedSelected}
          setSelectedIdx={setSelectedIdx}
          cwd={cwd}
        />
      )}
      {/* 헤더 */}
      <Box marginBottom={1} gap={2}>
        <Text bold>bugside</Text>
        <Text dimColor>watching: {sources.join(" · ")}</Text>
        <Text dimColor>│</Text>
        {isRawModeSupported && <Text dimColor>↑↓ select  ↵ open  c clear  q quit</Text>}
      </Box>

      {/* 에러 목록 */}
      {errors.length === 0 ? (
        <Box flexDirection="column" gap={1}>
          <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
            <Text color="green" bold>✓ No errors — all clear</Text>
          </Box>
          <Box gap={3} paddingX={1}>
            {sources.map((s) => (
              <Text key={s} color="green">✓ <Text dimColor>{s}</Text></Text>
            ))}
          </Box>
        </Box>
      ) : (
        <>
          {hiddenCount > 0 && (
            <Text dimColor>  ↑ {hiddenCount} older error{hiddenCount !== 1 ? "s" : ""} (c to clear)</Text>
          )}
          {visibleErrors.map((err, i) => {
            const absIdx = visibleStartIdx + i;
            return (
              <ErrorCard
                key={err.id}
                error={err}
                selected={isRawModeSupported && absIdx === clampedSelected}
              />
            );
          })}
        </>
      )}

      {/* 상태 바 */}
      <Box marginTop={1}>
        <Text dimColor>
          {unresolvedCount} error{unresolvedCount !== 1 ? "s" : ""}
          {errors.length > unresolvedCount
            ? `  ${errors.length - unresolvedCount} resolved`
            : ""}
        </Text>
      </Box>
    </Box>
  );
}
