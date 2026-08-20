const emailPattern = /(?<![\w.+-])[\w.+-]+@(?:[\w-]+\.)+[a-z]{2,}(?![\w-])/gi;
const internationalPhonePattern = /(?<![\w+])\+\d(?:[\s()-]*\d){6,14}(?!\w)/g;
const russianPhonePattern = /(?<!\w)8(?:[\s()-]*\d){10}(?!\w)/g;
const personalProfileUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[^\s/?#.,!;:)\]}]+|github\.com\/[a-z\d-]+(?=$|[\s?#.,!;:)\]}])|t\.me\/[a-z\d_]+|setka\.ru\/users\/[^\s/?#.,!;:)\]}]+|hh\.ru\/resume\/[^\s/?#.,!;:)\]}]+)/gi;
const telegramHandlePattern = /(\b(?:telegram|телеграм)\s*:\s*)@[a-z\d_]+/gi;
const employerLinePattern = /^(\s*(?:[-*+]\s*)?(?:Компания|Работодатель|Организация|Место работы)\s*[:—-]\s*)(\S(?:.*\S)?)[ \t]*$/gim;
const employerTableCellPattern = /(^|\|\s*)((?:Компания|Работодатель|Организация|Место работы)\s*[:—-]\s*)([^|\n]+?)(?=\s*\||\s*$)/gim;
const educationLinePattern = /^\s*(?:[-*+]\s*)?(?:Образование|Университет|ВУЗ|Учебное заведение)\s*[:—-]\s*\S(?:.*\S)?[ \t]*\r?\n?/gim;
const residenceLinePattern = /^(\s*(?:[-*+]\s*)?)(?:Проживает|Место проживания)\s*[:—-]\s*(\S(?:.*\S)?)[ \t]*$/gim;

export type DirectIdentifierSanitization = {
  sanitizedText: string;
};

export function sanitizeDirectIdentifiers(sourceText: string): DirectIdentifierSanitization {
  const replacementIds = new Map<string, string>();
  const counters = new Map<string, number>();
  const knownEmployers = new Map<string, string>();

  const replace = (category: string, value: string): string => {
    const key = `${category}:${normalizeIdentifier(category, value)}`;
    const existing = replacementIds.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const next = (counters.get(category) ?? 0) + 1;
    counters.set(category, next);

    const replacement = category === 'COMPANY' ? `КОМПАНИЯ ${next}` : `[${category}_${next}]`;
    replacementIds.set(key, replacement);
    if (category === 'COMPANY') knownEmployers.set(value.trim(), replacement);

    return replacement;
  };

  return {
    sanitizedText: replaceKnownEmployerMentions(
      sourceText
        .replace(personalProfileUrlPattern, (value) => replace('PROFILE_URL', value))
        .replace(telegramHandlePattern, (value, label: string) => `${label}${replace('TELEGRAM', value.slice(label.length))}`)
        .replace(emailPattern, (value) => replace('EMAIL', value))
        .replace(internationalPhonePattern, (value) => replace('PHONE', value))
        .replace(russianPhonePattern, (value) => replace('PHONE', value))
        .replace(employerTableCellPattern, (_cell, prefix: string, label: string, value: string) => `${prefix}${label}${replace('COMPANY', value.trim())}`)
        .replace(employerLinePattern, (_line, label: string, value: string) => {
          return /^КОМПАНИЯ \d+$/.test(value.trim()) ? `${label}${value}` : `${label}${replace('COMPANY', value)}`;
        })
        .replace(educationLinePattern, '')
        .replace(residenceLinePattern, (_line, prefix: string, city: string) => `${prefix}Город: ${city}`),
      knownEmployers,
    ),
  };
}

function replaceKnownEmployerMentions(sourceText: string, knownEmployers: Map<string, string>): string {
  const names = [...knownEmployers.keys()].sort((left, right) => right.length - left.length);

  if (names.length === 0) return sourceText;

  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu');

  return sourceText.replace(pattern, (value) => knownEmployers.get(value) ?? knownEmployers.get(findKnownEmployer(value, knownEmployers)) ?? value);
}

function findKnownEmployer(value: string, knownEmployers: Map<string, string>): string {
  return [...knownEmployers.keys()].find((name) => name.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0) ?? value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeIdentifier(category: string, value: string): string {
  if (category === 'PHONE') {
    const digits = value.replace(/\D/g, '');

    return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
  }

  return value.toLowerCase();
}
