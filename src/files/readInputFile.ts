import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractTextFromPdf } from "./extractTextFromPdf.js";

export async function readInputFile(dataDir: string, baseName: "resume" | "vacancy"): Promise<string> {
  const markdownPath = join(dataDir, `${baseName}.md`);
  const pdfPath = join(dataDir, `${baseName}.pdf`);

  if (existsSync(markdownPath)) {
    const markdown = await readMarkdownFile(markdownPath);

    if (!isStarterMarkdown(markdown) || !existsSync(pdfPath)) {
      return markdown;
    }
  }

  if (existsSync(pdfPath)) {
    return extractTextFromPdf(pdfPath);
  }

  throw new Error(`Missing input file: expected data/${baseName}.md or data/${baseName}.pdf.`);
}

async function readMarkdownFile(path: string): Promise<string> {
  const content = await readFile(path, "utf8");

  if (!content.trim()) {
    throw new Error(`Input file is empty: ${path}`);
  }

  return content.trim();
}

function isStarterMarkdown(content: string): boolean {
  return content.includes("Paste the candidate resume here") || content.includes("Paste the vacancy description here");
}
