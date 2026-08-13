import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { criticFindingsSchema } from "../../src/contracts/critic.contract.js";

import {
  assertCompleteLlmResponse,
  assertStructuredOutputCapability,
  createStructuredOutputFormat
} from "../../src/llm/llmClient.js";

test("builds a strict JSON Schema response format from a Zod contract", () => {
  const format = createStructuredOutputFormat(
    z.object({ schemaVersion: z.literal(1), title: z.string() }).strict(),
    "ExampleContract"
  );

  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.name, "ExampleContract");
  assert.equal(format.json_schema.strict, true);
  assert.deepEqual(format.json_schema.schema, {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      schemaVersion: { type: "number", const: 1 },
      title: { type: "string" }
    },
    required: ["schemaVersion", "title"],
    additionalProperties: false
  });
});

test("accepts the configured AITUNNEL DeepSeek V4 Flash structured-output route", () => {
  assert.doesNotThrow(() =>
    assertStructuredOutputCapability("https://api.aitunnel.ru/v1/", "deepseek-v4-flash")
  );
});

test("accepts the configured AITUNNEL GPT OSS 20b fallback route", () => {
  assert.doesNotThrow(() =>
    assertStructuredOutputCapability("https://api.aitunnel.ru/v1/", "gpt-oss-20b")
  );
});

test("rejects a route or model without an explicit structured-output capability", () => {
  assert.throws(
    () => assertStructuredOutputCapability("https://example.com/v1", "deepseek-v4-flash"),
    /does not support required strict Structured Outputs/
  );
  assert.throws(
    () => assertStructuredOutputCapability("https://api.aitunnel.ru/v1", "other-model"),
    /not declared as supporting required strict Structured Outputs/
  );
});

test("rejects a response stopped by the provider output limit", () => {
  assert.throws(() => assertCompleteLlmResponse("length"), /truncated before completion/);
  assert.doesNotThrow(() => assertCompleteLlmResponse("stop"));
});

test("uses a provider-compatible findings schema for Critic model output", () => {
  const schema = createStructuredOutputFormat(criticFindingsSchema, "CriticFindings").json_schema.schema;
  const serialized = JSON.stringify(schema);

  assert.doesNotMatch(serialized, /"decision"/);
  assert.doesNotMatch(serialized, /"reviewStatus"/);
  assert.match(serialized, /"claimAudit"/);
  assert.match(serialized, /"summary"/);
});
