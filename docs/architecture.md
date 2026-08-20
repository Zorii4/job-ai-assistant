# Архитектура

## Статус документа

Это публичное описание текущей архитектуры и подтверждённых целевых границ.
Схемы с пометкой **Target** не означают, что компонент уже реализован.

## Current

```text
React + Vite web
        |
        | HTTP, same-origin в Docker Compose
        v
NestJS API ----> PostgreSQL / Prisma
        |
        +--> Better Auth server sessions
        |
        +--> PgBoss <---- worker

Legacy adapters (CLI, Telegram)
        |
        v
Application use case
        |
        v
Initial AI workflow
        |
        +--> file-based run persistence
        +--> LLM adapter or deterministic mock mode
```

### Web и API

- `apps/web` — React + Vite frontend. Текущая UI-реализация покрывает библиотеку
  резюме, preview обезличенной версии, создание вакансии и polling initial-analysis run.
  Библиотека, создание вакансии и результат анализа доступны по отдельным URL, поэтому
  их можно открыть напрямую и безопасно повторно загрузить в браузере.
- `apps/api` — NestJS API. В нём реализованы healthcheck, server-side session
  guard, endpoints библиотеки резюме и создание файлового черновика вакансии.
- `packages/contracts` — shared Zod runtime contracts для public API.
- `prisma` — PostgreSQL schema и миграции.
- `apps/worker` — отдельный PgBoss consumer. Он получает только IDs, загружает
  snapshots из PostgreSQL и выполняет initial workflow и отдельный HR-preparation
  workflow без HTTP-сервера.
- `compose.yaml` — локальный стек web, API, worker и PostgreSQL за одним origin.

### Initial AI core и legacy adapters

Initial workflow остаётся отдельным от HTTP и Telegram:

```text
Analyst
  -> Producer
  -> Critic
  -> Producer revision при необходимости
  -> Critic
  -> Orchestrator
```

`src/app` содержит use case и порт persistence. `src/ai` координирует workflow,
а agent-модули не знают о NestJS, Prisma, HTTP или Telegram. CLI и Telegram в
`src/cli` и `src/telegram` используют legacy adapter-путь к тому же application
use case.

Текущий persistence adapter сохраняет run-результаты на диск. Он не заменён
database persistence и остаётся рабочим legacy-механизмом до отдельной миграции.

HR-подготовка — отдельный одношаговый use case, не расширение Producer. После
`HR_INVITED` worker использует только сохранённые snapshots обезличенного резюме и
вакансии, а также `finalMarkdown` успешного initial run. Он делает один structured
LLM-вызов без Critic и revision, валидирует 5–10 пар «вопрос — ответ» runtime-схемой
и сохраняет отдельный read-only Artifact. Карточка приглашённой вакансии запускает
этот workflow, показывает его статус и открывает готовый материал на существующей
странице результата.

### Prompt boundary

Production prompt texts находятся в private overlay и не импортируются tracked
agent-модулями напрямую. При запуске workflow получает один typed prompt bundle:

- mock mode использует безопасный детерминированный bundle для воспроизводимых
  тестов;
- real mode загружает private overlay и завершается configuration error до
  обращения к LLM, если overlay недоступен;
- structured contracts Analyst и Critic отправляются как strict JSON Schema только
  на явно настроенный совместимый маршрут; после ответа они всё равно проходят
  runtime-валидацию Zod, а обрезанный ответ не считается корректным;
- Analyst использует primary-модель из `LLM_MODEL`, одну recovery-попытку при
  невалидном structured response и настроенный `LLM_ANALYST_FALLBACK_MODEL` при
  timeout, network error или окончательно невалидном ответе primary-маршрута;
- Critic использует отдельный профиль: `deepseek-v4-flash` с 180-секундным budget и
  `gpt-oss-20b` как один технический fallback при timeout или output limit; оба маршрута
  проверены на его strict JSON Schema и не публикуют частичный пакет;
- модель возвращает атомарные findings Critic, а сервер детерминированно выводит из их
  severity поля `decision` и `reviewStatus`; это исключает противоречивый итог при
  сохранении runtime-валидации всех findings;
- Analyst и Producer используют 120-секундный лимит шага. Producer сохраняет не более
  одной автоматической технической повторной попытки, а Analyst после технического
  сбоя primary переключается на отдельную совместимую fallback-модель; общий timeout
  workflow остаётся верхней границей.
- prompt text не передаётся frontend и не включается в диагностические ошибки.

## Текущие данные и доверительные границы

```text
Browser
  -> authenticated API request
  -> ownership check by server session
  -> PostgreSQL record scoped by userId

Resume file
  -> validation and text extraction
  -> временный source text + editable sanitized version
  -> user confirmation required before future LLM use
  -> source text and source file name are cleared
```

Текущие resume API contracts не возвращают исходный текст. Загрузка допускает PDF,
MD и TXT с проверкой размера, MIME и расширения; input buffer очищается после
извлечения. После подтверждения обезличенной версии исходный текст и имя файла
очищаются из рабочей записи; существующие backup-копии удаляются по сроку ротации.
Проверки владения выполняются на сервере, а не через скрытые элементы интерфейса.

Техническое обезличивание снижает распространение прямых идентификаторов, но не
является юридической гарантией анонимизации.

## Target

Целевая архитектура остаётся модульным монолитом в одном TypeScript repository:

```text
apps/
  web
  api
  worker
  telegram            # target adapter boundary

packages/
  contracts
  domain              # target when domain boundary needs it
  application         # target when shared use cases move from legacy src/
  ai                  # target when AI core moves from legacy src/
```

Дальнейший vertical slice для вакансии должен использовать асинхронный lifecycle:

```text
API validates input, ownership and quota
  -> creates ApplicationCase and Run
  -> enqueues identifiers only
  -> worker loads data and executes workflow
  -> persists progress and result
  -> web polls or receives server-sent events
```

`ApplicationCase` частично реализован: API создаёт черновик из файла
PDF/MD/TXT после проверки владения подтверждённым резюме и сохраняет snapshot его
`sanitizedText`. `AnalysisRun` уже имеет отдельную персистентную модель со
статусами lifecycle. После server-side проверки владения API создаёт один
initial-analysis run и ставит в PgBoss только ID вакансии и run. Один worker-процесс
обрабатывает не более двух initial-analysis jobs одновременно. Worker atomically
claim'ит run, загружает snapshots из PostgreSQL, сохраняет этапы и finalMarkdown,
а при retry или ошибке записывает только технический code без raw error. Для terminal
LLM-сбоев code различает этап и безопасную категорию (`TIMEOUT`, `NETWORK_ERROR` или
`RESPONSE_INVALID`). Защищённый
polling endpoint возвращает владельцу статусы, этапы и технический code. Отдельный
endpoint результата отдаёт `finalMarkdown` только после успешного run и только его
владельцу. Web делает polling и безопасно отображает read-only Markdown-блоки без HTML
инъекций, сохраняя полный текст отчёта при незнакомой разметке. При известных разделах
worker создаёт idempotent Artifacts; API отдаёт их только владельцу вакансии. Исторические
поля пользовательских редакций пока сохраняются в схеме для совместимости, но UI не создаёт
новых редакций и не использует PATCH/reset endpoints. Перед запуском
initial analysis API атомарно резервирует одну из десяти lifetime-единиц ALPHA и возвращает её
при технической ошибке очереди или окончательной ошибке worker.
Сбой внутри уже начатого LLM workflow завершает конкретный run безопасным `FAILED` и не
перезапускает весь pipeline: внутренние bounded retry принадлежат шагу. Повторная доставка
очереди сохраняется для ошибок до claim run или при persistence после завершённого workflow.
Владелец может вручную повторно поставить failed initial analysis через тот же защищённый
API: существующий `AnalysisRun` очищается до `QUEUED`, поэтому не создаются второй run и
дубликаты результата. Возвращённая при предыдущем техническом сбое единица квоты
резервируется снова и расходуется только при успешном завершении.
После `HR_INVITED` отдельный защищённый endpoint создаёт один HR-preparation run для
той же вакансии; очередь получает IDs, а worker atomically claim'ит run только при
успешном initial analysis. HR worker получает snapshots и `finalMarkdown` из БД,
делает один LLM-вызов, сохраняет idempotent Artifact и переводит вакансию в
`HR_PREPARATION_READY`. Ошибка LLM завершает только HR run безопасным code и не
повторяет initial workflow; доставка повторяется лишь для persistence-ошибки.
Эти компоненты не должны обходить границы privacy, ownership или initial workflow.

## Архитектурные инварианты

- Один пользовательский запрос не получает доступ к сущности другого пользователя.
- Source resume text не должен попадать в LLM; initial workflow использует только
  подтверждённую обезличенную версию или её snapshot.
- Очередь worker получает identifiers, а не полные пользовательские тексты.
- `generatedContent` и пользовательская редакция будущих материалов хранятся
  раздельно.
- Initial workflow сохраняет порядок агентов и ограниченное число revision.
- Public code не включает production prompts, реальные evaluation-данные или
  credentials.

## Как поддерживать документ

При изменении реализованной архитектуры, trust boundary, persistence, API или
статуса target-компонента этот документ обновляется в той же задаче. Новая
архитектурная диаграмма не должна показывать target как current.
