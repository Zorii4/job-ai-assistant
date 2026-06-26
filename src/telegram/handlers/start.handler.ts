import type { Bot } from "grammy";

export function registerStartHandler(bot: Bot): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "Привет. Я помогу проанализировать отклик на вакансию.",
        "",
        "Команды:",
        "/analyze - начать анализ",
        "/cancel - отменить текущий сценарий"
      ].join("\n")
    );
  });
}
