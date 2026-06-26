import type { Bot, Context } from "grammy";
import { analyzeJobApplication } from "../../app/analyzeJobApplication.js";
import {
  clearAnalyzeSession,
  getAnalyzeSession,
  saveResumeText,
  startAnalyzeSession
} from "../session/memorySession.js";

const telegramMessageLimit = 4096;
const safeTelegramMessageLimit = 3800;

export function registerAnalyzeHandler(bot: Bot): void {
  bot.command("analyze", async (ctx) => {
    const chatId = getChatId(ctx);

    startAnalyzeSession(chatId);
    await ctx.reply("Пришлите текст резюме.");
  });

  bot.command("cancel", async (ctx) => {
    const chatId = getChatId(ctx);

    clearAnalyzeSession(chatId);
    await ctx.reply("Текущий сценарий отменён.");
  });

  bot.on("message:text", async (ctx) => {
    const chatId = getChatId(ctx);
    const text = ctx.message.text.trim();
    const session = getAnalyzeSession(chatId);

    if (!session) {
      await ctx.reply("Чтобы начать анализ, отправьте /analyze.");
      return;
    }

    if (!text || text.startsWith("/")) {
      return;
    }

    if (session.step === "waiting_resume") {
      saveResumeText(chatId, text);
      await ctx.reply("Теперь пришлите текст вакансии.");
      return;
    }

    if (session.step === "waiting_vacancy") {
      const resumeText = session.resumeText;

      if (!resumeText) {
        clearAnalyzeSession(chatId);
        await ctx.reply("Не удалось найти текст резюме. Начните заново командой /analyze.");
        return;
      }

      clearAnalyzeSession(chatId);
      await ctx.reply("Анализирую отклик. Это может занять немного времени.");

      try {
        const result = await analyzeJobApplication({
          resumeText,
          vacancyText: text,
          source: "telegram",
          userId: String(ctx.from?.id ?? ctx.chat.id)
        });

        for (const message of splitTelegramMessage(result.finalMarkdown)) {
          await ctx.reply(message);
        }
      } catch (error) {
        console.error("[telegram] analyze failed", error);
        await ctx.reply("Не удалось выполнить анализ. Попробуйте ещё раз позже или проверьте настройки LLM.");
      }
    }
  });
}

export function splitTelegramMessage(text: string): string[] {
  if (text.length <= telegramMessageLimit) {
    return [text];
  }

  const messages: string[] = [];
  let remainingText = text;

  while (remainingText.length > safeTelegramMessageLimit) {
    const splitIndex = findSplitIndex(remainingText, safeTelegramMessageLimit);
    messages.push(remainingText.slice(0, splitIndex).trimEnd());
    remainingText = remainingText.slice(splitIndex).trimStart();
  }

  if (remainingText) {
    messages.push(remainingText);
  }

  return messages;
}

function findSplitIndex(text: string, maxLength: number): number {
  const paragraphIndex = text.lastIndexOf("\n\n", maxLength);

  if (paragraphIndex > 0) {
    return paragraphIndex;
  }

  const lineIndex = text.lastIndexOf("\n", maxLength);

  if (lineIndex > 0) {
    return lineIndex;
  }

  const spaceIndex = text.lastIndexOf(" ", maxLength);

  if (spaceIndex > 0) {
    return spaceIndex;
  }

  return maxLength;
}

function getChatId(ctx: Context): number {
  if (!ctx.chat?.id) {
    throw new Error("Telegram chat id is missing.");
  }

  return ctx.chat.id;
}
