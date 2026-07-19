import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy adapters delegate result persistence to the application use case", async () => {
  const cliSource = await readFile(
    new URL("../src/cli/analyzeFromDataFolder.ts", import.meta.url),
    "utf8"
  );
  const telegramSource = await readFile(
    new URL("../src/telegram/handlers/analyze.handler.ts", import.meta.url),
    "utf8"
  );
  const legacyCompositionSource = await readFile(
    new URL("../src/legacy/analyzeJobApplication.ts", import.meta.url),
    "utf8"
  );

  assert.match(cliSource, /analyzeJobApplication/);
  assert.match(telegramSource, /analyzeJobApplication/);
  assert.match(telegramSource, /getRunResultDirectory/);
  assert.match(legacyCompositionSource, /createAnalyzeJobApplication/);
  assert.match(legacyCompositionSource, /fileAnalysisRunPersistence/);
  assert.doesNotMatch(cliSource, /saveRunResult\(/);
  assert.doesNotMatch(telegramSource, /saveRunResult\(/);
});
