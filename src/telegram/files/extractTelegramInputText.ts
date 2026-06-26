import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Context } from "grammy";
import { extractTextFromPdf } from "../../files/extractTextFromPdf.js";
import type { JobApplicationInputExtension, JobApplicationInputPartMeta } from "../../types/jobApplication.js";
import { validateInputFileName } from "../guards/inputGuard.js";

export type TelegramInputText = JobApplicationInputPartMeta & {
  text: string;
};

export class TelegramInputTextError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
  }
}

export async function extractTelegramInputText(ctx: Context): Promise<TelegramInputText> {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : undefined;

  if (text) {
    return {
      text,
      sourceType: "text"
    };
  }

  const document = ctx.message && "document" in ctx.message ? ctx.message.document : undefined;

  if (!document) {
    throw new TelegramInputTextError("Пришлите текст сообщением или файл .pdf, .md, .txt.");
  }

  const fileValidation = validateInputFileName(document.file_name);

  if (!fileValidation.ok) {
    throw new TelegramInputTextError(fileValidation.message ?? "Этот тип файла не поддерживается.");
  }

  const extension = fileValidation.extension as JobApplicationInputExtension;
  const sizeBytes = document.file_size;
  const maxFileSizeBytes = getMaxFileSizeBytes();

  if (sizeBytes !== undefined && sizeBytes > maxFileSizeBytes) {
    throw new TelegramInputTextError(
      `Файл слишком большой. Максимальный размер: ${getMaxFileSizeMb()} МБ.`
    );
  }

  const tempPath = await downloadTelegramDocument(ctx, document.file_id, extension);

  try {
    const extractedText = await extractTextFromTempFile(tempPath, extension);

    return {
      text: extractedText,
      sourceType: "file",
      fileName: document.file_name,
      extension,
      mimeType: document.mime_type,
      sizeBytes
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

async function downloadTelegramDocument(
  ctx: Context,
  fileId: string,
  extension: JobApplicationInputExtension
): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing. Add it to .env.");
  }

  const file = await ctx.api.getFile(fileId);

  if (!file.file_path) {
    throw new TelegramInputTextError("Не удалось получить путь к файлу в Telegram.");
  }

  const chatId = ctx.chat?.id ?? "unknown";
  const tempDir = resolve(process.cwd(), "tmp", `telegram-${chatId}`);
  const tempPath = join(tempDir, `${randomUUID()}${extension}`);
  const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new TelegramInputTextError("Не удалось скачать файл из Telegram. Попробуйте еще раз.");
  }

  const arrayBuffer = await response.arrayBuffer();

  await mkdir(tempDir, { recursive: true });
  await writeFile(tempPath, Buffer.from(arrayBuffer));

  return tempPath;
}

async function extractTextFromTempFile(
  tempPath: string,
  extension: JobApplicationInputExtension
): Promise<string> {
  if (extension === ".pdf") {
    try {
      return await extractTextFromPdf(tempPath);
    } catch {
      throw new TelegramInputTextError(
        "Не получилось извлечь текст из PDF. Возможно, это скан или изображение. Пришлите PDF с выделяемым текстом или вставьте текст сообщением."
      );
    }
  }

  const text = await readFile(tempPath, "utf8");

  return text.trim();
}

function getMaxFileSizeMb(): number {
  const rawValue = process.env.TELEGRAM_MAX_FILE_SIZE_MB;

  if (!rawValue) {
    return 10;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function getMaxFileSizeBytes(): number {
  return getMaxFileSizeMb() * 1024 * 1024;
}
