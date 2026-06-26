import type { Context, NextFunction } from "grammy";

const deniedMessage = "Бот пока работает в закрытом тестовом режиме.";

export async function accessGuard(ctx: Context, next: NextFunction): Promise<void> {
  const userId = getTelegramUserId(ctx);

  if (!userId || !isTelegramUserAllowed(userId)) {
    await ctx.reply(deniedMessage);
    return;
  }

  await next();
}

export function isTelegramUserAllowed(userId: string): boolean {
  const allowedIds = parseAllowedTelegramUserIds();

  if (allowedIds.length === 0) {
    return true;
  }

  return allowedIds.includes(userId);
}

function parseAllowedTelegramUserIds(): string[] {
  const rawValue = process.env.ALLOWED_TELEGRAM_USER_IDS?.trim();

  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTelegramUserId(ctx: Context): string | undefined {
  const id = ctx.from?.id ?? ctx.chat?.id;

  return id === undefined ? undefined : String(id);
}
