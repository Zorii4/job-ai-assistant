import assert from 'node:assert/strict';
import test from 'node:test';

import { extractPdfTextItems, normalizePdfTextItemsToMarkdown } from '../src/resumes/resume-pdf-structure.js';

test('normalizes layout-aware PDF text items in reading order without inventing Markdown semantics', () => {
  const markdown = normalizePdfTextItemsToMarkdown([
    { text: 'Senior developer', pageNumber: 1, x: 72, y: 680, hasEol: true },
    { text: 'Experience', pageNumber: 1, x: 72, y: 720, hasEol: true },
    { text: 'TypeScript', pageNumber: 1, x: 180, y: 680, hasEol: false },
    { text: 'Skills', pageNumber: 1, x: 72, y: 640, hasEol: true },
  ]);

  assert.equal(markdown, 'Experience\n\nSenior developer TypeScript\n\nSkills');
});

test('keeps adjacent text fragments in one visual line', () => {
  assert.equal(
    normalizePdfTextItemsToMarkdown([
      { text: 'Company', pageNumber: 1, x: 72, y: 500, hasEol: false },
      { text: 'Example', pageNumber: 1, x: 140, y: 501, hasEol: true },
    ]),
    'Company Example',
  );
});

test('extracts a synthetic PDF into line-preserving Markdown', async () => {
  const items = await extractPdfTextItems(createSimplePdf([['Experience', 'TypeScript']]));

  assert.equal(normalizePdfTextItemsToMarkdown(items), 'Experience\n\nTypeScript');
});

test('keeps pages in PDF order when their coordinates repeat', async () => {
  const pdf = createSimplePdf([
    ['Page one heading', 'Page one content'],
    ['Page two heading', 'Page two content'],
  ]);
  const items = await extractPdfTextItems(pdf);
  const normalized = normalizePdfTextItemsToMarkdown(items);

  assert.equal(
    normalized,
    'Page one heading\n\nPage one content\n\nPage two heading\n\nPage two content',
  );
});

function createSimplePdf(pages: string[][]): Buffer {
  const fontObjectNumber = 3 + pages.length * 2;
  const pageObjectNumbers = pages.map((_, index) => 3 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ...pages.flatMap((lines, index) => {
      const content = ['BT', '/F1 16 Tf', ...lines.flatMap((line, lineIndex) => [lineIndex === 0 ? '72 720 Td' : '0 -28 Td', `(${line}) Tj`]), 'ET'].join('\n');
      const pageObjectNumber = pageObjectNumbers[index];
      const contentObjectNumber = pageObjectNumber + 1;

      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
      ];
    }),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, 'utf8');
}
