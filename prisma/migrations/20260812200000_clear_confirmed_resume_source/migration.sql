UPDATE "resume"
SET
    "sourceText" = '',
    "sourceFileName" = NULL
WHERE "sanitizationStatus" = 'CONFIRMED'
  AND ("sourceText" <> '' OR "sourceFileName" IS NOT NULL);
