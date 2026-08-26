# Приватность и безопасность

Документ описывает технические границы реализованного portfolio-MVP на commit
[`0c43f31`](https://github.com/Zorii4/job-ai-assistant/commit/0c43f31437a71431a8aa286b62e6f78170791a64).
Это не юридическая политика конфиденциальности и не обещание абсолютной анонимности.

## Потоки данных

### Резюме

```text
PDF / MD / TXT
  → validation размера, MIME и расширения
  → извлечение текста в памяти
  → временный source text + редактируемая sanitized Markdown-версия
  → явный review и подтверждение пользователя
  → очистка source text и имени исходного файла
  → AI использует только confirmed snapshot
```

Source resume text не возвращается public Resume API. Upload buffer очищается после
извлечения. Production backup пока не реализован; до внешнего запуска нужно определить
сроки хранения и учесть, что backup-копии удалённого source text исчезают только по
ротации, а не мгновенно.

### Вакансия и AI

```text
confirmed resume + vacancy file
  → immutable sanitized snapshots in PostgreSQL
  → ID-only PgBoss job
  → worker loads snapshots
  → isolated AI workflow
  → validated read-only result
```

Source resume text, raw upload files и полные пользовательские документы не помещаются
в queue payload. Production prompts остаются в ignored private overlay и не выдаются
frontend.

### Post-interview

Пользователь вставляет одно сообщение HR длиной до 8 000 символов. Сервер считает его
недоверенным input, удаляет прямые контакты и финальную подпись до persistence и не
сохраняет raw message. Worker получает IDs, затем загружает sanitized message, vacancy
snapshot и successful initial `finalMarkdown`. Полный resume snapshot и HR preparation
material в этот workflow не передаются.

## Реализованные меры

### Authentication и ownership

- Better Auth обрабатывает регистрацию по одноразовому инвайту, подтверждение email,
  login, recovery и logout.
- Browser использует server-side session в httpOnly cookie и не хранит долгоживущий
  auth token в localStorage.
- Protected API routes проверяют server session.
- Resume, ApplicationCase, Run и Artifact queries ограничиваются `userId` или
  эквивалентной owner relation.
- Tests проверяют невозможность прочитать, изменить, запустить workflow или удалить
  сущность другого пользователя.

### File input

- Разрешены только PDF, MD и TXT.
- До extraction проверяются размер, MIME и расширение.
- Пользовательский путь не используется как filesystem path.
- Извлечённый текст ограничивается по размеру.
- Повреждённый или неподдерживаемый файл отклоняется безопасной ошибкой.
- Исходный upload buffer не сохраняется как публичный файл.

### Queue, quota и recovery

- Initial, HR preparation и post-interview job schemas допускают identifiers, но
  отклоняют пользовательские тексты как extra fields.
- API атомарно проверяет ownership, active capacity и quota до запуска нового initial
  run.
- Atomic worker claim и unique constraints предотвращают второй workflow и duplicate
  Artifact при повторной доставке.
- Terminal technical failure не расходует дополнительную product unit; каждый failed
  workflow имеет ограниченный server-side manual retry budget.
- Persisted initial checkpoints позволяют не повторять уже завершённые LLM-steps при
  совместимой конфигурации.

После terminal failure manual initial retry атомарно re-reserve-ит возвращённую unit до
изменения run. Если quota уже исчерпана другой вакансией, retry не ставится в очередь и
run остаётся `FAILED`. Ошибка постановки откатывает re-reservation, а terminal worker
path освобождает её один раз.

### LLM boundary

- Production prompt text отсутствует в tracked-коде.
- Real mode без private prompt bundle завершается до LLM network call.
- Structured responses проходят provider JSON Schema и runtime Zod validation;
  truncated или partial response не публикуется.
- Critic findings и `claimAudit` ограничены strict contract, а terminal decision
  вычисляется сервером.
- Public mock mode предназначен для воспроизводимых tests и не представляется как
  качество реальной модели.

### Rendering и диагностика

- Read-only Markdown renderer не исполняет raw HTML.
- Пользовательские тексты, prompt text, raw LLM responses, cookies, auth headers,
  tokens и API keys не предназначены для логирования.
- Persisted technical errors используют safe stage/category codes без raw provider
  error.
- Цвет не является единственным носителем статуса; основные actions доступны с
  клавиатуры.

### Public repository

Tracked paths классифицируются как `PUBLIC`, `PUBLIC_AFTER_REVIEW`, `PRIVATE`, `SECRET`
или `GENERATED`. Public-safety scanner и hooks блокируют
private/secret/generated/unclassified paths и распространённые secret patterns.
`PUBLIC_AFTER_REVIEW` и любые images требуют ручной проверки: scanner дополняет, но не
заменяет content review документов, fixtures, assets и Git history.

## Ограничения технического обезличивания

Текущий sanitizer удаляет контакты и profile/social URLs, нормализует город и заменяет
работодателей только в распознанных структурных полях со стабильными placeholders.
Свободный текст не проходит агрессивную NER-обработку: это уменьшает ложное удаление
профессионального контекста, но может оставить квазиидентификатор.

Пользователь всегда просматривает и подтверждает версию. Интерфейс не называет это
юридически гарантированной анонимизацией. Текущее подтверждение относится к конкретной
проверенной версии и ссылается на честную placeholder-страницу: юридическая политика
для внешнего запуска ещё не утверждена.

## Оставшиеся launch gates

До внешней закрытой альфы нужны отдельные решения и проверки:

- договорная и privacy/legal проверка конкретного LLM-route;
- production `Secure`/SameSite cookie, CSRF, proxy и rate-limit configuration;
- secret storage и доставка private prompts только worker-у;
- зашифрованный PostgreSQL backup, ротация и проверенное восстановление;
- monitoring без пользовательского content;
- утверждённые пользовательские документы, сроки хранения и удаления.

Локальный Docker Compose не закрывает эти требования и не считается production
deployment.

## Ответственное раскрытие

Не публикуйте детали потенциальной уязвимости в issue, discussion или pull request.
Используйте приватный канал из [SECURITY.md](../SECURITY.md). При подтверждённой утечке
секрета сначала отзовите его и ограничьте доступ; удаление следующим commit не очищает
Git history.

## Как поддерживать документ

Документ обновляется вместе с изменением trust boundary, auth, file lifecycle, queue
payload, LLM inputs, logging или deployment status. Новые типы данных и файлов сначала
получают явную classification до публикации.
