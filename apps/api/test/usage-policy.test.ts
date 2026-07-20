import assert from 'node:assert/strict';
import test from 'node:test';

import { PlanCode } from '../src/generated/prisma/client.js';
import { getUsagePolicy } from '../src/usage/usage-policy.js';

test('ALPHA plan grants ten product units', () => {
  assert.deepEqual(getUsagePolicy(PlanCode.ALPHA), {
    productUnitLimit: 10,
  });
});
