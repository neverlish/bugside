import React from "react";
import { Box, Text, useInput, useApp, useStdin } from "ink";
import { BugError, ProjectConfig } from "../types.js";
import { ErrorCard } from "./ErrorCard.js";

interface Props {
  config: ProjectConfig;
  errors: BugError[];
  onClear: () => void;
}

function KeyboardHandler({ onClear }: { onClear: () => void }) {
  const { exit } = useApp();
  useInput((input) => {
    if (input === "q") exit();
    if (input === "c") onClear();
  });
  return null;
}

export function App({ config, errors, onClear }: Props) {
  const { isRawModeSupported } = useStdin();

  const unresolvedCount = errors.filter((e) => !e.resolved).length;

  const sources = [
    config.hasNextjs && "Next.js",
    config.hasSupabase && "Supabase",
    config.hasVercel && "Vercel",
  ].filter(Boolean) as string[];

  return (
    <Box flexDirection="column" padding={1}>
      {isRawModeSupported && <KeyboardHandler onClear={onClear} />}
      {/* 헤더 */}
      <Box marginBottom={1} gap={2}>
        <Text bold>bugside</Text>
        <Text dimColor>watching: {sources.join(" · ")}</Text>
        <Text dimColor>│</Text>
        {isRawModeSupported && <Text dimColor>q quit  c clear</Text>}
      </Box>

      {/* 에러 목록 */}
      {errors.length === 0 ? (
        <Box borderStyle="single" borderColor="gray" paddingX={2} paddingY={1}>
          <Text dimColor>No errors — all clear</Text>
        </Box>
      ) : (
        errors.map((err) => <ErrorCard key={err.id} error={err} />)
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
