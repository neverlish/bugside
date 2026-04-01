import React from "react";
import { Box, Text } from "ink";
import { BugError, ErrorSource } from "../types.js";
import { formatTime } from "../utils.js";

const SOURCE_COLOR: Record<ErrorSource, string> = {
  nextjs: "red",
  supabase: "yellow",
  vercel: "blue",
};

const SOURCE_LABEL: Record<ErrorSource, string> = {
  nextjs: "Next.js",
  supabase: "Supabase",
  vercel: "Vercel",
};

export function ErrorCard({ error }: { error: BugError }) {
  const color = SOURCE_COLOR[error.source];
  const label = SOURCE_LABEL[error.source];

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={color} paddingX={1} marginBottom={1}>
      <Box gap={1}>
        <Text color={color} bold>{label}</Text>
        <Text dimColor>{formatTime(error.timestamp)}</Text>
      </Box>
      <Text>{error.message}</Text>
      {error.detail && <Text dimColor>{error.detail}</Text>}
      {error.file && (
        <Text dimColor>→ {error.file}{error.line ? `:${error.line}` : ""}</Text>
      )}
    </Box>
  );
}
