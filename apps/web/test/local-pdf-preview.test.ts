import assert from 'node:assert/strict';
import test from 'node:test';

import { isPdfFile } from '../src/components/LocalPdfPreview.js';

test('recognizes a PDF by MIME type or extension for local-only preview', () => {
  assert.equal(isPdfFile({ name: 'resume', type: 'application/pdf' } as File), true);
  assert.equal(isPdfFile({ name: 'resume.PDF', type: '' } as File), true);
  assert.equal(isPdfFile({ name: 'resume.md', type: 'text/markdown' } as File), false);
});
