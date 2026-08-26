# Публичная спецификация продукта

## Статус

Документ описывает реализованный и проверяемый публичный scope на commit
[`0c43f31`](https://github.com/Zorii4/job-ai-assistant/commit/0c43f31437a71431a8aa286b62e6f78170791a64).
Job AI Assistant остаётся portfolio-MVP без публичного production deployment.

## Проблема и результат

Работа с вакансией требует сопоставить требования с опытом, выбрать акценты и
подготовить несколько материалов для общения с работодателем. Продукт организует этот
процесс вокруг одной вакансии пользователя и создаёт проверяемые черновики, но не
отправляет отклики, письма или сообщения от его имени.

Одна продуктовая единица объединяет:

- один initial analysis;
- одну HR-подготовку после приглашения;
- один post-interview разбор;
- сохранённые read-only материалы и историю вакансии.

## Реализованный пользовательский путь

1. Пользователь регистрируется по одноразовому инвайту, подтверждает email и получает
   server-side session в httpOnly cookie.
2. Загружает резюме в PDF, MD или TXT, редактирует автоматически подготовленную
   обезличенную Markdown-версию и подтверждает её для AI.
3. Загружает вакансию, выбирает подтверждённое резюме и запускает асинхронный analysis.
4. Видит активный процесс после навигации или reload, а после завершения открывает
   сохранённый read-only Markdown-отчёт и выделенные материалы.
5. Управляет вакансией в истории со статусами `IN_PROGRESS`, `REJECTED` или `OFFER`;
   technical status AI-run хранится и показывается отдельно.
6. После приглашения запускает отдельную HR-подготовку из 5–10 пар «вопрос — ответ».
7. После скрининга вставляет сообщение HR длиной до 8 000 символов и получает краткий
   разбор с отдельным закрывающим сообщением для ручной отправки.

## Реализованные возможности

| Область | Текущее поведение | Проверяемая опора |
| --- | --- | --- |
| Web/API-платформа | React + Vite, NestJS, PostgreSQL/Prisma, PgBoss worker и Docker Compose работают как один modular monolith. | [architecture](architecture.md), [workspace packages](../package.json) |
| Auth и ownership | Invite-only registration, email verification, login, recovery и logout используют server-side sessions. User-owned queries ограничиваются владельцем на сервере. | [auth tests](../apps/api/test/auth.e2e.test.ts), [application tests](../apps/api/test/applications.service.test.ts) |
| Библиотека резюме | File-only intake для PDF/MD/TXT, максимум пять резюме, Markdown-preserving extraction, редактирование и подтверждение обезличенной версии, read-only просмотр и удаление. | [resume service tests](../apps/api/test/resumes.service.test.ts), [sanitizer tests](../apps/api/test/resume-sanitizer.test.ts) |
| Вакансии и история | До десяти вакансий; отдельно показаны active analysis и общая история. Активный run удалить нельзя, terminal vacancy удаляется только явно с подтверждением. | [application service](../apps/api/src/applications/applications.service.ts), [history UI tests](../apps/web/test/application-case-list.test.ts) |
| Initial analysis | `Analyst → Producer → Critic → revision при необходимости → Critic → Orchestrator`; worker сохраняет progress, checkpoints, terminal decision и read-only result. | [workflow](../src/ai/runInitialAnalysisWorkflow.ts), [worker tests](../apps/worker/test/initial-analysis.worker.test.ts) |
| HR preparation | Отдельный одношаговый structured workflow по сохранённым snapshots и успешному initial result; не повторяет initial analysis. | [worker](../apps/worker/src/hr-preparation.worker.ts), [tests](../apps/worker/test/hr-preparation.worker.test.ts) |
| Post-interview | Отдельный одношаговый workflow атомарно создаёт `POST_INTERVIEW_REVIEW` и `HR_CLOSING_MESSAGE`; LLM не меняет outcome вакансии. | [worker](../apps/worker/src/post-interview.worker.ts), [tests](../apps/worker/test/post-interview.worker.test.ts) |
| Usage и recovery | ALPHA получает десять lifetime product units. Одновременно допускаются два active initial run. Failed initial attempt освобождает reservation; manual retry переиспользует run и атомарно резервирует unit заново. При уже исчерпанном лимите run остаётся `FAILED`. Каждый workflow имеет не более трёх ручных retry. | [usage policy](../apps/api/src/usage/usage-policy.ts), [application tests](../apps/api/test/applications.service.test.ts) |
| Private prompt boundary | Production prompts отсутствуют в tracked-коде; real mode без private overlay завершается до LLM-вызова, mock mode остаётся детерминированным. | [prompt bundle](../src/ai/initialWorkflowPromptBundle.ts), [boundary tests](../test/prompt-bundle-boundary.test.ts) |

## AI-workflows и контракты

Initial analysis сохраняет legacy-семантику и единый `finalMarkdown`. Critic возвращает
ограниченный structured `claimAudit`, а приложение детерминированно выводит итоговые
`decision` и `reviewStatus` из severity валидированных findings. Если последняя
разрешённая версия остаётся `NEEDS_REVISION`, Orchestrator публикует её как черновик,
сохраняя terminal decision Critic отдельно от технического статуса run.

HR preparation и post-interview используют собственные prompt bundles, runtime-схемы,
jobs и persistence. Общим может быть технический runner, но входы, контракты и
ответственность workflows не смешиваются.

Успешные initial steps сохраняются как валидированные checkpoints. Retry продолжает
первый незавершённый шаг только при совпадении snapshot и prompt/model fingerprint;
несовместимый checkpoint очищается, чтобы один результат не смешивал разные
конфигурации.

## Приватность и безопасность

- Source resume text не возвращается public API и не передаётся в LLM.
- После подтверждения обезличенной версии рабочая запись очищается от исходного текста
  и имени файла; production backup и сроки ротации пока остаются launch gate.
- Job payloads содержат IDs, а не resume, vacancy или HR message text.
- Post-interview input обезличивается до persistence; raw HR message не сохраняется.
- Пользовательские тексты, prompt text, raw LLM responses, cookies и credentials не
  предназначены для логирования.
- Markdown отображается без исполнения raw HTML.
- Техническая псевдонимизация снижает риск, но не является юридической гарантией
  анонимизации.

Подробнее: [privacy и security](privacy-and-security.md), [SECURITY.md](../SECURITY.md).

## Проверяемые критерии

- public runtime contracts отклоняют лишние и невалидные поля;
- ownership tests запрещают чтение и изменение чужих Resume, ApplicationCase, Run и
  Artifact;
- queue contract tests отклоняют payloads с полными пользовательскими текстами;
- worker tests покрывают success, duplicate delivery, restart, retry, terminal failure,
  quota release и отсутствие duplicate Artifact;
- frontend tests покрывают routing, empty/loading/error/success, progressive HR-flow,
  retry limits, безопасный Markdown и responsive controls;
- `npm run check:public-safety` блокирует private, secret, generated и
  неклассифицированные tracked-файлы.

## Не-цели текущей версии

- автоматическая отправка материалов работодателю;
- свободный AI-чат и неограниченная перегенерация;
- URL-import вакансии;
- интерактивное или техническое интервью;
- платежи, подписки и командные аккаунты;
- публичный production deployment;
- публикация production prompts или evaluation corpus;
- обещание трудоустройства либо безошибочности AI-материалов.

## Следующая граница

Следующий продуктовый этап — инфраструктура закрытой альфы: deployment-конфигурация,
секреты, резервное копирование и проверка восстановления, мониторинг, договорная
проверка LLM-route и privacy/legal review. Всё это не считается реализованным текущим
локальным Docker Compose.
