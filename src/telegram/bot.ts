import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Bot } from "grammy";
import { registerAnalyzeHandler } from "./handlers/analyze.handler.js";
import { registerStartHandler } from "./handlers/start.handler.js";
import { accessGuard } from "./guards/accessGuard.js";

loadEnvFile(resolve(process.cwd(), ".env"));

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === "put-your-telegram-bot-token-here") {
    throw new Error("TELEGRAM_BOT_TOKEN is missing. Add it to .env.");
  }

  const bot = new Bot(token);

  bot.use(accessGuard);

  registerStartHandler(bot);
  registerAnalyzeHandler(bot);

  bot.catch(() => {
    console.error("[telegram] bot error");
  });

  console.log("[telegram] bot started with long polling");
  await bot.start();
}

try {
  await main();
} catch {
  console.error("[telegram] failed");
  process.exitCode = 1;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
