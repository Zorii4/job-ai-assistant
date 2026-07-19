import { InputFile, type Bot, type Context } from "grammy";
import { join } from "node:path";
import { analyzeJobApplication } from "../../app/analyzeJobApplication.js";
import { saveRunResult } from "../../files/saveRunResult.js";
import { classifyLlmError } from "../../llm/retryTransientRequest.js";
import type { AnalyzeJobApplicationProgressStage, JobApplicationInputPartMeta } from "../../types/jobApplication.js";
import { formatFinalMarkdownForTelegram } from "../formatters/formatFinalMarkdownForTelegram.js";
import {
  extractTelegramInputText,
  TelegramInputTextError,
  type TelegramInputText
} from "../files/extractTelegramInputText.js";
import { validateResumeText, validateVacancyText } from "../guards/inputGuard.js";
import { hasUnsafeFinalOutput } from "../guards/outputGuard.js";
import { consumeAnalysisAttempt } from "../guards/rateLimiter.js";
import {
  clearAnalyzeSession,
  getAnalyzeSession,
  saveResumeText,
  saveVacancyInputMeta,
  startAnalyzeSession
} from "../session/memorySession.js";

export function registerAnalyzeHandler(bot: Bot): void {
  bot.command("analyze", async (ctx) => {
    const chatId = getChatId(ctx);

    startAnalyzeSession(chatId);
    await ctx.reply("Пришли резюме текстом или файлом: .pdf, .md, .txt");
  });

  bot.command("cancel", async (ctx) => {
    const chatId = getChatId(ctx);

    clearAnalyzeSession(chatId);
    await ctx.reply("Текущий сценарий отменен.");
  });

  bot.on("message:document", handleAnalyzeInput);
  bot.on("message:text", handleAnalyzeInput);
}

async function handleAnalyzeInput(ctx: Context): Promise<void> {
    const chatId = getChatId(ctx);
    const session = getAnalyzeSession(chatId);

    if (!session) {
      await ctx.reply("Я помогаю только с анализом отклика на вакансию. Используйте /analyze.");
      return;
    }

    const rawText = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : undefined;

    if (!rawText && !(ctx.message && "document" in ctx.message)) {
      return;
    }

    if (rawText?.startsWith("/")) {
      return;
    }

    let input: TelegramInputText;

    try {
      input = await extractTelegramInputText(ctx);
    } catch (error) {
      if (error instanceof TelegramInputTextError) {
        await ctx.reply(error.userMessage);
        return;
      }

      throw error;
    }

    if (session.step === "waiting_resume") {
      const resumeValidation = validateResumeText(input.text);

      if (!resumeValidation.ok) {
        await ctx.reply(resumeValidation.message ?? "Текст резюме не прошел техническую проверку.");
        return;
      }

      saveResumeText(chatId, input.text, toInputMeta(input));
      await ctx.reply("✅ Резюме принято. Теперь пришли вакансию текстом или файлом: .pdf, .md, .txt");
      return;
    }

    if (session.step === "waiting_vacancy") {
      const resumeText = session.resumeText;

      if (!resumeText) {
        clearAnalyzeSession(chatId);
        await ctx.reply("Не удалось найти текст резюме. Начните заново командой /analyze.");
        return;
      }

      const vacancyValidation = validateVacancyText(input.text);

      if (!vacancyValidation.ok) {
        await ctx.reply(vacancyValidation.message ?? "Текст вакансии не прошел техническую проверку.");
        return;
      }

      try {
        const userId = String(ctx.from?.id ?? chatId);
        const rateLimit = consumeAnalysisAttempt(userId);

        if (!rateLimit.allowed) {
          await ctx.reply("Лимит бесплатных анализов на выбранный период исчерпан. Попробуйте позже.");
          return;
        }

        saveVacancyInputMeta(chatId, toInputMeta(input));
        clearAnalyzeSession(chatId);
        await ctx.reply("✅ Данные приняты. Проверяю и запускаю анализ.");
        await ctx.reply("Анализирую отклик. Это может занять немного времени.");

        console.log("[telegram] starting analysis");
        const sentProgressStages = new Set<AnalyzeJobApplicationProgressStage>();
        const result = await analyzeJobApplication({
          resumeText,
          vacancyText: input.text,
          source: "telegram",
          userId,
          inputMeta: {
            resume: session.resumeInputMeta,
            vacancy: toInputMeta(input)
          },
          onProgress: async (event) => {
            if (sentProgressStages.has(event.stage)) {
              return;
            }

            sentProgressStages.add(event.stage);
            await ctx.reply(progressMessageByStage(event.stage));
          }
        });

        console.log("[telegram] saving run result");
        const runDir = await saveRunResult(result, resumeText, input.text);

        if (hasUnsafeFinalOutput(result.finalMarkdown)) {
          console.warn(`[telegram] unsafe final output detected for runId=${result.meta.runId}`);
          await ctx.reply("Результат был сформирован некорректно. Я сохранил run-логи для отладки.");
          return;
        }

        console.log("[telegram] sending final result");
        await ctx.reply(formatFinalMarkdownForTelegram(result.finalMarkdown));
        await ctx.replyWithDocument(new InputFile(join(runDir, "final.md")), {
          caption: "Полный отчёт в Markdown-файле."
        });

        console.log("[telegram] done");
      } catch (error) {
        console.error(`[telegram] analyze failed: ${classifyLlmError(error)}`);
        await ctx.reply("Не удалось выполнить анализ. Попробуйте еще раз позже.");
      }
    }
}

function progressMessageByStage(stage: AnalyzeJobApplicationProgressStage): string {
  if (stage === "analyst") {
    return "🔎 Анализирую соответствие резюме и вакансии...";
  }

  if (stage === "producer") {
    return "✍️ Готовлю материалы отклика...";
  }

  if (stage === "critic") {
    return "🧪 Проверяю качество результата...";
  }

  return "📦 Собираю финальный ответ...";
}

function toInputMeta(input: TelegramInputText): JobApplicationInputPartMeta {
  return {
    sourceType: input.sourceType,
    fileName: input.fileName,
    extension: input.extension,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes
  };
}

function getChatId(ctx: Context): number {
  if (!ctx.chat?.id) {
    throw new Error("Telegram chat id is missing.");
  }

  return ctx.chat.id;
}
