const forbiddenOutputMarkers = [
  "DECISION:",
  "SYSTEM PROMPT",
  "INTERNAL",
  "FEEDBACK TO PRODUCER",
  "CRITIC",
  "КРИТИК",
  "PRODUCER.V",
  "REVISION REQUIRED"
];

export function hasUnsafeFinalOutput(finalMarkdown: string): boolean {
  const normalizedOutput = finalMarkdown.toUpperCase();

  return forbiddenOutputMarkers.some((marker) => normalizedOutput.includes(marker));
}
