# Job AI Assistant

Проект, который развивается из Telegram-бота в web-приложение для работы кандидата с конкретной вакансией. Он помогает оценить соответствие опыта требованиям, увидеть сильные стороны и пробелы, принять взвешенное решение об отклике и подготовить материалы для ручного общения с работодателем.

AI-first разработка ведётся с coding-агентами в specification-driven процессе: перед реализацией фиксируются границы задачи и проверяемые критерии, затем выполняется небольшой vertical slice с тестами и review.

## Статус

Проект находится в активной разработке. Уже доступны web/API-платформа, библиотека резюме, создание вакансии с запуском initial analysis и сохранённый legacy AI-workflow. История материалов и HR-сценарии пока запланированы. Это не production deployment: AI не отправляет отклики, письма или сообщения от имени пользователя, а выводы и подготовленные материалы требуют ручной проверки.

## Что реализовано

- Библиотека резюме: текст, PDF, MD или TXT; редактируемая обезличенная версия и её подтверждение.
- Регистрация по одноразовому инвайту, подтверждение email, вход, восстановление доступа и выход через server-side sessions.
- Серверные проверки владения данными, ограничения входных файлов и runtime-контракты API.
- Initial AI workflow: оценка соответствия вакансии, выводы и риски, рекомендации для резюме и материалы для отклика; `Analyst → Producer → Critic → revision при необходимости → Orchestrator`.
- Детерминированный mock mode для воспроизводимых тестов и публичной разработки.
- React + Vite frontend, NestJS API, PostgreSQL/Prisma и Docker Compose.

Исходный текст резюме не предназначен для передачи в LLM. Production prompts, реальные пользовательские данные и evaluation-материалы не входят в публичный набор файлов. Mock mode подтверждает воспроизводимость кода, а не качество production AI.

## Архитектура

```text
React + Vite web → NestJS API → PostgreSQL / Prisma

Legacy CLI / Telegram adapters → application use case → initial AI workflow
```

Подробнее о текущих и целевых компонентах — в [архитектуре](docs/architecture.md). API-основа вакансии, очередь и worker реализованы частично; web-сценарий результата, материалы и квоты ещё в работе.

## Репозиторий и процесс

```text
apps/                 web и API
packages/contracts/   shared runtime-контракты
src/                  legacy AI-core, CLI и Telegram adapters
prisma/               schema и миграции
```

Разработка следует SDD: задача ограничивается проверяемой спецификацией, минимальной реализацией и тестами. Coding-агенты помогают исследовать и проверять изменения, а решения о продукте, рисках и внешних действиях остаются за владельцем.

## Быстрый запуск

Нужны Node.js, npm и Docker Compose.

```powershell
npm ci
Copy-Item .env.example .env
# В .env задайте уникальные POSTGRES_PASSWORD и BETTER_AUTH_SECRET (не менее 32 символов).
docker compose up --build
```

После запуска откройте `http://localhost`. Для mock-разработки установите `LLM_MOCK=true`. Для real LLM заполните `LLM_API_KEY`, `LLM_MODEL` и `LLM_BASE_URL` данными своего провайдера; также нужен локальный private prompt overlay в `src/prompts/`, которого в публичном репозитории нет. Перед `docker compose up --build` для real LLM выполните `npm run build:legacy`: Compose подключает скомпилированный локальный overlay только к worker, не добавляя промпты в Docker-образ.

Полные инструкции для локального запуска и VPS: [DEPLOYMENT.md](DEPLOYMENT.md).

## Проверки

```sh
npm test
npm run build
npm run prisma:validate
npm run check:public-safety
```

Перед commit можно включить локальный hook:

```sh
git config core.hooksPath .githooks
```

## Документация

- [Публичная спецификация](docs/product-spec.md) — реализованный и планируемый scope.
- [Архитектура](docs/architecture.md) — текущие границы и target-модель.
- [Privacy и security](docs/privacy-and-security.md) и [SECURITY.md](SECURITY.md).
- [SDD-процесс](docs/sdd-process.md) и [работа с coding-агентами](docs/agent-development.md).
- [Roadmap](docs/roadmap.md).

## Лицензия

Исходный код доступен только для ознакомления. Проект не является open source: без
предварительного письменного согласия автора не разрешены воспроизведение,
распространение, изменение или коммерческое использование кода. Внешние contributions
на первом этапе не принимаются.

## Контакты

Telegram: [@Zorin_4](https://t.me/Zorin_4) · Email: [workzor@bk.ru](mailto:workzor@bk.ru)
