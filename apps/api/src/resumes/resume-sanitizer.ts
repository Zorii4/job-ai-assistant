const emailPattern = /(?<![\w.+-])[\w.+-]+@(?:[\w-]+\.)+[a-z]{2,}(?![\w-])/gi;
const internationalPhonePattern = /(?<![\w+])\+\d(?:[\s()-]*\d){6,14}(?!\w)/g;
const russianPhonePattern = /(?<!\w)8(?:[\s()-]*\d){10}(?!\w)/g;
const personalProfileUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[^\s/?#.,!;:)\]}]+|github\.com\/[a-z\d-]+(?=$|[\s?#.,!;:)\]}])|t\.me\/[a-z\d_]+)/gi;
const employerLinePattern = /^(\s*(?:[-*+]\s*)?(?:Компания|Работодатель|Организация|Место работы)\s*[:—-]\s*)(\S(?:.*\S)?)\s*$/gim;
const educationLinePattern = /^(\s*(?:[-*+]\s*)?(?:Образование|Университет|ВУЗ|Учебное заведение)\s*[:—-]\s*)(\S(?:.*\S)?)\s*$/gim;

export type DirectIdentifierSanitization = {
  sanitizedText: string;
};

export function sanitizeDirectIdentifiers(sourceText: string): DirectIdentifierSanitization {
  const replacementIds = new Map<string, string>();
  const counters = new Map<string, number>();

  const replace = (category: string, value: string): string => {
    const key = `${category}:${normalizeIdentifier(category, value)}`;
    const existing = replacementIds.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const next = (counters.get(category) ?? 0) + 1;
    counters.set(category, next);

    const replacement = `[${category}_${next}]`;
    replacementIds.set(key, replacement);

    return replacement;
  };

  return {
    sanitizedText: sourceText
      .replace(personalProfileUrlPattern, (value) => replace('PROFILE_URL', value))
      .replace(emailPattern, (value) => replace('EMAIL', value))
      .replace(internationalPhonePattern, (value) => replace('PHONE', value))
      .replace(russianPhonePattern, (value) => replace('PHONE', value))
      .replace(employerLinePattern, (_line, label: string, value: string) => {
        return `${label}${replace('EMPLOYER', value)}`;
      })
      .replace(educationLinePattern, (_line, label: string, value: string) => {
        return `${label}${replace('EDUCATION', value)}`;
      }),
  };
}

function normalizeIdentifier(category: string, value: string): string {
  if (category === 'PHONE') {
    const digits = value.replace(/\D/g, '');

    return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
  }

  return value.toLowerCase();
}
