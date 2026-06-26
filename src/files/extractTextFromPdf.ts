import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse";

export async function extractTextFromPdf(path: string): Promise<string> {
  const buffer = await readFile(path);
  const parsed = await pdfParse(buffer);
  const text = parsed.text.trim();

  if (!text) {
    throw new Error(`No text could be extracted from PDF: ${path}`);
  }

  return text;
}
