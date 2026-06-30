const maxTelegramSummaryLength = 3500;

const preferredSections = [
  "Решение по вакансии",
  "Ключевые выводы Аналитика",
  "Главные риски",
  "Сильные стороны кандидата",
  "Заключение Контролёра",
  "Финальная оценка качества"
];

export function formatFinalMarkdownForTelegram(finalMarkdown: string): string {
  const plainText = markdownToPlainText(finalMarkdown);
  const sections = extractPreferredSections(plainText);
  const summaryBody = sections.length > 0 ? sections.join("\n\n") : plainText;
  const summary = `Краткий итог анализа\n\n${summaryBody}`;

  return truncateAtBoundary(summary, maxTelegramSummaryLength);
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !isMarkdownTableLine(line))
    .map((line) => {
      return line
        .replace(/^#{1,6}\s+/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^\s*[-*]\s+/g, "- ")
        .replace(/^\s*---+\s*$/g, "")
        .trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isMarkdownTableLine(line: string): boolean {
  const trimmedLine = line.trim();

  return trimmedLine.startsWith("|") && trimmedLine.endsWith("|");
}

function extractPreferredSections(text: string): string[] {
  const allSections = splitByTopLevelSections(text);

  return preferredSections
    .map((title) => allSections.find((section) => section.title.toLowerCase() === title.toLowerCase()))
    .filter((section): section is { title: string; content: string } => Boolean(section))
    .map((section) => `${section.title}\n\n${section.content}`.trim());
}

function splitByTopLevelSections(text: string): Array<{ title: string; content: string }> {
  const lines = text.split("\n");
  const sections: Array<{ title: string; content: string }> = [];
  let currentTitle = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    if (isLikelySectionTitle(line)) {
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentContent.join("\n").trim()
        });
      }

      currentTitle = line.trim();
      currentContent = [];
      continue;
    }

    if (currentTitle) {
      currentContent.push(line);
    }
  }

  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentContent.join("\n").trim()
    });
  }

  return sections;
}

function isLikelySectionTitle(line: string): boolean {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.length > 90) {
    return false;
  }

  if (/^\d+\./.test(trimmedLine)) {
    return false;
  }

  return /^[А-ЯA-ZЁ][А-ЯA-Zа-яa-zЁё0-9\s/.-]+$/.test(trimmedLine);
}

function truncateAtBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const cutoff = findSplitIndex(text, maxLength - 80);

  return `${text.slice(0, cutoff).trimEnd()}\n\nПолный отчёт приложен файлом final.md.`;
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
