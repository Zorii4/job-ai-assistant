import { BadRequestException } from '@nestjs/common';
import { extname, basename } from 'node:path';

import pdfParse from 'pdf-parse';

import { extractPdfTextItems, normalizePdfTextItemsToMarkdown } from './resume-pdf-structure.js';

const MAX_RESUME_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 50_000;

const allowedMimeTypesByExtension = {
  '.pdf': new Set(['application/pdf']),
  '.md': new Set(['text/markdown', 'text/plain']),
  '.txt': new Set(['text/plain']),
} as const;

type SupportedExtension = keyof typeof allowedMimeTypesByExtension;

export type UploadedResumeFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export function filterResumeUpload(
  _request: unknown,
  file: Pick<UploadedResumeFile, 'originalname' | 'mimetype'>,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  callback(null, isAllowedFileMetadata(file.originalname, file.mimetype));
}

export async function extractUploadedResumeFile(
  file: UploadedResumeFile | undefined,
): Promise<{ sourceFileName: string; sourceText: string }> {
  if (file === undefined || file.size === 0 || file.size > MAX_RESUME_FILE_SIZE_BYTES) {
    throw new BadRequestException();
  }

  const extension = getSupportedExtension(file.originalname, file.mimetype);

  if (extension === undefined) {
    throw new BadRequestException();
  }

  try {
    const sourceText =
      extension === '.pdf'
        ? await extractTextFromPdfBuffer(file.buffer)
        : decodeTextFile(file.buffer);

    if (sourceText.length === 0 || sourceText.length > MAX_EXTRACTED_TEXT_LENGTH) {
      throw new BadRequestException();
    }

    return {
      sourceFileName: getSafeFileName(file.originalname),
      sourceText,
    };
  } finally {
    file.buffer.fill(0);
  }
}

export function getMaxResumeFileSizeBytes(): number {
  return MAX_RESUME_FILE_SIZE_BYTES;
}

function isAllowedFileMetadata(fileName: string, mimeType: string): boolean {
  return getSupportedExtension(fileName, mimeType) !== undefined;
}

function getSupportedExtension(
  fileName: string,
  mimeType: string,
): SupportedExtension | undefined {
  const extension = extname(fileName).toLowerCase() as SupportedExtension;
  const allowedMimeTypes = allowedMimeTypesByExtension[extension];

  return allowedMimeTypes?.has(mimeType.toLowerCase()) ? extension : undefined;
}

function getSafeFileName(fileName: string): string {
  const safeName = basename(fileName.replaceAll('\\', '/'))
    .replace(/[\\/\u0000-\u001F]/g, '_')
    .trim();

  return safeName.slice(0, 255);
}

function decodeTextFile(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).trim();
  } catch {
    throw new BadRequestException();
  }
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const text = normalizePdfTextItemsToMarkdown(await extractPdfTextItems(buffer));

    if (text.length === 0) {
      throw new Error('PDF has no extractable text');
    }

    return text;
  } catch {
    try {
      const parsed = await pdfParse(buffer);
      const text = parsed.text.trim();

      if (text.length === 0) {
        throw new Error('PDF has no extractable text');
      }

      return text;
    } catch {
      throw new BadRequestException();
    }
  }
}
