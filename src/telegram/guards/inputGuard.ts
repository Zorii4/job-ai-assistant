type InputGuardResult = {
  ok: boolean;
  message?: string;
};

type FileGuardResult = {
  ok: boolean;
  extension?: string;
  message?: string;
};

const maxTextLength = 60000;
const resumeMinLength = 300;
const vacancyMinLength = 300;
const minKeywordMatches = 3;
const allowedFileExtensions = new Set([".pdf", ".md", ".txt"]);
const forbiddenFileExtensions = new Set([".exe", ".js", ".html", ".docm", ".zip"]);

const resumeKeywords = [
  "опыт",
  "навыки",
  "образование",
  "обязанности",
  "достижения",
  "должность",
  "соискатель",
  "резюме",
  "стаж",
  "компетенции",
  "квалификация",
  "трудовой"
];

const vacancyKeywords = [
  "вакансия",
  "требования",
  "условия",
  "зарплата",
  "оклад",
  "график",
  "компания",
  "ищем",
  "приглашаем",
  "предлагаем",
  "сотрудника",
  "специалиста"
];

export function validateResumeText(resumeText: string): InputGuardResult {
  return validateText({
    text: resumeText,
    label: "резюме",
    minLength: resumeMinLength,
    keywords: resumeKeywords,
    keywordError:
      "Текст резюме не похож на резюме."
  });
}

export function validateVacancyText(vacancyText: string): InputGuardResult {
  return validateText({
    text: vacancyText,
    label: "вакансии",
    minLength: vacancyMinLength,
    keywords: vacancyKeywords,
    keywordError:
      "Текст вакансии не похож на вакансию."
  });
}

export function validateInputFileName(fileName: string | undefined): FileGuardResult {
  if (!fileName) {
    return {
      ok: false,
      message: "Не удалось определить имя файла. Пришлите текст резюме или вакансии сообщением."
    };
  }

  const extension = getFileExtension(fileName);

  if (!extension) {
    return {
      ok: false,
      message: "Файл без расширения не поддерживается. Разрешены только .pdf, .md и .txt."
    };
  }

  if (forbiddenFileExtensions.has(extension)) {
    return {
      ok: false,
      extension,
      message: `Файлы ${extension} запрещены. Разрешены только .pdf, .md и .txt.`
    };
  }

  if (!allowedFileExtensions.has(extension)) {
    return {
      ok: false,
      extension,
      message: `Файлы ${extension} не поддерживаются. Разрешены только .pdf, .md и .txt.`
    };
  }

  return {
    ok: true,
    extension
  };
}

function validateText(options: {
  text: string;
  label: string;
  minLength: number;
  keywords: string[];
  keywordError: string;
}): InputGuardResult {
  const text = options.text.trim();

  if (text.length < options.minLength) {
    return {
      ok: false,
      message: `Текст ${options.label} слишком короткий. Минимум: ${options.minLength} символов.`
    };
  }

  if (text.length > maxTextLength) {
    return {
      ok: false,
      message: `Текст ${options.label} слишком длинный. Максимум: ${maxTextLength} символов.`
    };
  }

  if (countKeywordMatches(text, options.keywords) < minKeywordMatches) {
    return {
      ok: false,
      message: options.keywordError
    };
  }

  return { ok: true };
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const normalizedText = text.toLowerCase();

  return keywords.reduce((count, keyword) => {
    return normalizedText.includes(keyword.toLowerCase()) ? count + 1 : count;
  }, 0);
}

function getFileExtension(fileName: string): string {
  const normalizedFileName = fileName.trim().toLowerCase();
  const lastDotIndex = normalizedFileName.lastIndexOf(".");

  if (lastDotIndex === -1 || lastDotIndex === normalizedFileName.length - 1) {
    return "";
  }

  return normalizedFileName.slice(lastDotIndex);
}
