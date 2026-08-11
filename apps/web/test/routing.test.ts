import assert from 'node:assert/strict';
import test from 'node:test';

import { getAppRoutePath, parseAppRoute } from '../src/routing.js';

test('parses the library and vacancy creation routes', () => {
  assert.deepEqual(parseAppRoute('/'), { name: 'resumes' });
  assert.deepEqual(parseAppRoute('/resumes'), { name: 'resumes' });
  assert.deepEqual(parseAppRoute('/applications/new'), { name: 'new-application' });
});

test('parses and serializes an analysis result route', () => {
  const route = {
    name: 'analysis-result' as const,
    applicationCaseId: 'application one',
    runId: 'run/one',
  };

  assert.equal(
    getAppRoutePath(route),
    '/applications/application%20one/analysis/run%2Fone',
  );
  assert.deepEqual(
    parseAppRoute('/applications/application%20one/analysis/run%2Fone'),
    route,
  );
});

test('marks an unknown URL as not found', () => {
  assert.deepEqual(parseAppRoute('/unknown'), { name: 'not-found' });
  assert.deepEqual(parseAppRoute('/applications/%E0%A4%A/analysis/run_1'), { name: 'not-found' });
});
