import React from "react";
import { Box, Text } from "ink";
import { BugError, ErrorSource } from "../types.js";
import { formatTime } from "../utils.js";

const SOURCE_COLOR: Record<ErrorSource, string> = {
  nextjs: "red",
  supabase: "yellow",
  vercel: "blue",
  network: "magenta",
};

const SOURCE_BG: Record<ErrorSource, string> = {
  nextjs: "red",
  supabase: "yellow",
  vercel: "blue",
  network: "magenta",
};

const SOURCE_LABEL: Record<ErrorSource, string> = {
  nextjs: "Next.js",
  supabase: "Supabase",
  vercel: "Vercel",
  network: "Network",
};

export function ErrorCard({ error, selected }: { error: BugError; selected?: boolean }) {
  const color = SOURCE_COLOR[error.source];
  const bg = SOURCE_BG[error.source];
  const label = SOURCE_LABEL[error.source];

  return (
    <Box gap={1} marginBottom={1}>
      <Text color="cyan">{selected ? "▶" : " "}</Text>
    <Box flexDirection="column" borderStyle="round" borderColor={selected ? "cyan" : color} paddingX={1} flexGrow={1}>
      {/* 헤더 행: [소스 배지] 메시지  시간 */}
      <Box gap={1}>
        <Text backgroundColor={bg} color="white" bold> {label} </Text>
        <Text color={color} bold wrap="truncate">{error.message}</Text>
        <Text dimColor>{formatTime(error.timestamp)}</Text>
      </Box>
      {/* 상세 / 스택 */}
      {error.detail && (
        <Text color="white" dimColor>  {error.detail}</Text>
      )}
      {/* 파일 위치 */}
      {error.file && (
        <Text color={color} dimColor>  → {error.file}{error.line ? `:${error.line}` : ""}</Text>
      )}
    </Box>
    </Box>
  );
}
