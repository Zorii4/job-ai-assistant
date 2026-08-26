# Инструкции для coding-агентов

## Перед работой

Эти правила действуют для всего репозитория и должны быть достаточны в clean clone.

Перед значимой задачей:

1. Прочитайте этот файл, [README.md](README.md) и относящиеся документы из `docs/`.
2. Явно проверьте `local/internal-docs/AGENTS.private.md` через `Test-Path` или
   `Get-ChildItem -Force`. Обычный `rg --files` уважает `.gitignore` и не доказывает
   отсутствие private-файла.
3. Если private supplement доступен, прочитайте его и указанные им нормативные
   документы до реализации.
4. Прочитайте более локальный `AGENTS.md`, если он существует в затронутой подпапке.

Не ищите и не восстанавливайте отсутствующие private-материалы, secrets, production
prompts, реальные резюме или evaluation corpus.

## Контекст и инварианты

Job AI Assistant — русскоязычный portfolio-MVP для работы кандидата с конкретной
вакансией. Он создаёт черновики для ручной проверки и не отправляет отклики, письма или
сообщения от имени пользователя.

Initial workflow сохраняет порядок и смысл:

```text
Analyst
  → Producer
  → Critic
  → Producer revision при необходимости
  → Critic
  → Orchestrator
```

Обязательные ограничения:

- Не менять порядок, prompt contract, модель и final output format initial workflow в
  одной попутной задаче.
- Не удалять Critic и не разделять Producer package без отдельного решения и regression
  evidence.
- HR preparation и post-interview проектировать как отдельные workflows, а не расширять
  Producer.
- Не выдавать target architecture или deployment за current implementation.
- AI только готовит материалы; внешнее действие всегда выполняет человек.
- Не расширять scope будущими возможностями из roadmap без задачи владельца.

Текущий scope описан в [product spec](docs/product-spec.md), current/target границы — в
[architecture](docs/architecture.md).

## Privacy и security

- Source resume text не передаётся в LLM. AI использует только подтверждённый sanitized
  snapshot.
- Queue payload содержит identifiers, а не полные пользовательские тексты.
- Не логируйте resume/vacancy/HR text, prompt text, raw LLM responses с пользовательским
  content, cookies, auth headers, tokens или keys.
- Каждый запрос к Resume, ApplicationCase, Run и Artifact проверяет владельца на
  сервере. Скрытый UI control не является авторизацией.
- Внешние данные проходят runtime validation; TypeScript assertion её не заменяет.
- Для файлов и пользовательского ввода учитывайте IDOR, XSS, CSRF, path traversal,
  oversized input, prompt injection, rate limits и race conditions.
- Не называйте техническую псевдонимизацию юридически гарантированной анонимизацией.
- Не выполняйте реальные платные LLM-вызовы без явной задачи, согласованного режима и
  понимания стоимости.

Подробнее: [privacy-and-security.md](docs/privacy-and-security.md) и
[SECURITY.md](SECURITY.md).

## Public/private boundary

Каждый tracked path должен соответствовать `public-file-policy.json`: `PUBLIC`,
`PUBLIC_AFTER_REVIEW`, `PRIVATE`, `SECRET` или `GENERATED`. Второй статус требует
ручного content review перед публикацией. Неизвестный tracked path запрещён до решения
владельца.

При новом пути или изменении его назначения:

1. Объясните содержимое и предложите classification владельцу.
2. После решения синхронно обновите policy, private classification record, `.gitignore`
   и scanner, если они затронуты.
3. Не используйте `git add -f` для обхода ignore.

Production prompts, реальные пользовательские данные, evaluation materials, logs и
fixtures с реальным content не добавляются в Git. Перед commit запускайте:

```sh
npm run check:public-safety
```

Hook настраивается один раз: `git config core.hooksPath .githooks`.

## Рабочая итерация

1. Проверьте `git status` и относящийся diff; сохраните пользовательские изменения.
2. Изучите затронутый код, tests и документацию.
3. Сформулируйте инварианты, scope и короткий проверяемый план.
4. Сделайте минимальное изменение без несвязанного refactor.
5. Добавьте tests пропорционально риску.
6. Запустите релевантные checks и просмотрите полный diff.
7. Обновите public docs и file classification, если изменились наблюдаемое поведение,
   architecture, privacy/security boundary или feature status.
8. В результате перечислите собственные изменения, проверки и remaining risks.

Один PR должен представлять одну reviewable итерацию. В PR фиксируются problem, scope,
non-goals, acceptance criteria, решения владельца, checks и remaining risks.

## Frontend

- `App.tsx` остаётся точкой session и верхнеуровневой композиции.
- Самостоятельные сценарии, API-запросы, формы и result views размещаются в отдельных
  feature/component modules.
- Компонент около 300 строк или с несколькими независимыми сценариями декомпозируется до
  дальнейшего расширения.
- Для новой страницы, layout или visual redesign используйте доступный локальный
  визуальный процесс проекта и [design system](docs/design-system.md).
- Сохраняйте loading, empty, error, success, disabled и accessible keyboard states.
- Markdown рендерится без raw HTML execution.

## Минимальные проверки

- Backend: validation, ownership, happy path и error path.
- Job: success, retry, duplicate delivery, quota invariance и no duplicate Artifact.
- AI contract: valid/invalid fixture, missing field и релевантные запреты.
- Frontend: loading, empty, error, success, основной action, keyboard и responsive
  states.
- Public docs/assets: links, classification, PII/metadata/right-to-publish review и
  public-safety scanner.

Тесты по умолчанию не обращаются к реальной LLM. Используйте относящиеся команды:
`npm test`, `npm run build`, `npm run prisma:validate` и
`npm run check:public-safety`.

## Dirty worktree и зависимости

- Не перезаписывайте чужие изменения и неизвестные новые файлы.
- Не используйте `git reset --hard` или `git checkout --` для очистки worktree.
- Если задача пересекается с существующим diff, сначала изучите его.
- Перед новой dependency проверьте существующий stack и официальную документацию.
- Не добавляйте несколько библиотек с одной ролью, не меняйте package manager и не
  выполняйте массовое обновление зависимостей попутно.

## Когда остановиться

Запросите решение владельца, если требуется:

- изменить семантику AI-workflow или production prompt;
- выбрать несовместимую migration либо риск потери данных;
- подключить внешний сервис с персональными данными или платой;
- изменить quota, product unit, license model или product scope;
- выполнить внешнее действие от лица пользователя;
- опубликовать закрытый материал или создать public deployment;
- сделать предположение, существенно влияющее на UX, architecture, data, security,
  privacy или объём работы.

Для мелкого обратимого решения внутри согласованных границ выберите минимальный
безопасный вариант и явно сообщите о допущении.
