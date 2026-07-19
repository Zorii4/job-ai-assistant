import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

const originalWorkingDirectory = process.cwd();
const originalSaveInputText = process.env.SAVE_INPUT_TEXT;
const testWorkingDirectory = await mkdtemp(join(tmpdir(), "job-ai-assistant-output-privacy-test-"));

process.chdir(testWorkingDirectory);

const { fileAnalysisRunPersistence } = await import("../src/files/fileAnalysisRunPersistence.js");

before(() => {
  process.chdir(testWorkingDirectory);
});

after(async () => {
  process.chdir(originalWorkingDirectory);

  if (originalSaveInputText === undefined) {
    delete process.env.SAVE_INPUT_TEXT;
  } else {
    process.env.SAVE_INPUT_TEXT = originalSaveInputText;
  }

  await rm(testWorkingDirectory, { recursive: true, force: true });
});

test("does not persist source texts unless explicitly enabled", async () => {
  delete process.env.SAVE_INPUT_TEXT;
  const runId = "default-private-run";

  await fileAnalysisRunPersistence.initializeRun({
    runId,
    resumeText: "private resume",
    vacancyText: "private vacancy"
  });

  await assert.rejects(access(join(testWorkingDirectory, "output", "runs", runId, "input.resume.txt")));
  await assert.rejects(access(join(testWorkingDirectory, "output", "runs", runId, "input.vacancy.txt")));
});

test("allows explicitly enabled source-text persistence for synthetic local debugging", async () => {
  process.env.SAVE_INPUT_TEXT = "true";
  const runId = "explicit-debug-run";

  await fileAnalysisRunPersistence.initializeRun({
    runId,
    resumeText: "synthetic resume",
    vacancyText: "synthetic vacancy"
  });

  assert.equal(
    await readFile(join(testWorkingDirectory, "output", "runs", runId, "input.resume.txt"), "utf8"),
    "synthetic resume\n"
  );
  assert.equal(
    await readFile(join(testWorkingDirectory, "output", "runs", runId, "input.vacancy.txt"), "utf8"),
    "synthetic vacancy\n"
  );
});
