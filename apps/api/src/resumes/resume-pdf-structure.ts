import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const lineTolerance = 2;

export type PdfTextItem = {
  text: string;
  pageNumber: number;
  x: number;
  y: number;
  hasEol: boolean;
};

export async function extractPdfTextItems(buffer: Buffer): Promise<PdfTextItem[]> {
  const document = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const items: PdfTextItem[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();

      for (const item of content.items) {
        if (!('str' in item) || item.str.trim().length === 0) continue;

        items.push({
          text: item.str,
          pageNumber,
          x: item.transform[4],
          y: item.transform[5],
          hasEol: item.hasEOL,
        });
      }
    }
  } finally {
    document.cleanup();
  }

  return items;
}

export function normalizePdfTextItemsToMarkdown(items: PdfTextItem[]): string {
  const lines: Array<{ pageNumber: number; y: number; items: PdfTextItem[] }> = [];

  for (const item of [...items].sort((left, right) => left.pageNumber - right.pageNumber || right.y - left.y || left.x - right.x)) {
    const currentLine = lines.at(-1);

    if (
      currentLine === undefined ||
      currentLine.pageNumber !== item.pageNumber ||
      Math.abs(currentLine.y - item.y) > lineTolerance
    ) {
      lines.push({ pageNumber: item.pageNumber, y: item.y, items: [item] });
      continue;
    }

    currentLine.items.push(item);
  }

  const extractedLines = lines
    .map((line) => ({
      pageNumber: line.pageNumber,
      y: line.y,
      text: line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim(),
    }))
    .filter((line) => line.text.length > 0);
  const lineGaps = extractedLines.slice(1)
    .map((line, index) => extractedLines[index].pageNumber === line.pageNumber ? extractedLines[index].y - line.y : 0)
    .filter((gap) => gap > 0)
    .sort((left, right) => left - right);
  const typicalLineGap = lineGaps[Math.floor(lineGaps.length / 2)] ?? 0;

  return extractedLines.reduce((text, line, index) => {
    if (index === 0) return line.text;

    const previousLine = extractedLines[index - 1];
    const startsNewParagraph = previousLine.pageNumber !== line.pageNumber ||
      (typicalLineGap > 0 && previousLine.y - line.y > typicalLineGap * 1.5);

    return `${text}${startsNewParagraph ? '\n\n' : ' '}${line.text}`;
  }, '');
}
