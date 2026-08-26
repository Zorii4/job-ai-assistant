# Specification-driven development

## Как развивается проект

Job AI Assistant строится небольшими reviewable итерациями. Coding-агент исследует,
реализует и проверяет изменение, но продуктовые границы, риск и внешние действия остаются
решением владельца.

```text
problem and owner decision
  → bounded acceptance criteria
  → affected invariants
  → code and migration
  → tests and build
  → diff review
  → public docs and file classification
  → remaining risk
```

Private normative specification, production prompts и evaluation corpus не публикуются.
Публичные документы описывают только факты, которые можно проверить в code, tests и
истории PR.

## Правила итерации

- Один PR представляет одну проверяемую проблему или необходимый atomic slice.
- Scope и non-goals фиксируются до реализации.
- Ownership проверяется сервером; скрытый UI control не считается авторизацией.
- Пользовательские документы считаются недоверенными данными.
- Source resume text не передаётся в LLM или queue payload.
- Изменение архитектуры, production prompt, модели и final output contract не
  объединяется без отдельного решения.
- Реальные платные LLM-вызовы не входят в обычные test/build проверки.
- Публичное поведение, architecture status и file classification обновляются в той же
  итерации.

## Evidence case study 1: проверяемый Critic

### Проблема

Один итоговый `APPROVED` не показывает, какие утверждения проверил Critic и на каких
данных он основывался. Ручной review также подтвердил, что `APPROVED` нельзя выдавать за
гарантию отсутствия ошибок.

### Инварианты и решение владельца

Initial workflow, Producer package и финальный Markdown сохраняются. Владелец закрепил
продуктовую семантику: `APPROVED` означает только отсутствие найденной блокирующей
проблемы, а пользователь всё равно проверяет отмеченные assumptions, `WARNING` и
`CONDITIONAL` перед ручной отправкой.

Вместо неаудируемого model verdict Critic возвращает bounded findings и обязательный
`claimAudit`: классификацию утверждения, severity и короткое evidence. Поля `decision` и
`reviewStatus` модель больше не выбирает; приложение выводит их детерминированно из
severity валидированного результата.

### Acceptance criteria

- strict schema отклоняет missing/extra fields, пустое evidence и превышение лимита;
- `CRITICAL` всегда даёт revision-required outcome, а `WARNING` не может исчезнуть из
  итогового статуса;
- JSON Schema отправляется только совместимому structured-output route;
- частичный или обрезанный ответ не публикуется;
- UI не позиционирует `APPROVED` как гарантию.

### Доказательство

- bounded runtime contract: [`src/contracts/critic.contract.ts`](../src/contracts/critic.contract.ts);
- valid/invalid и decision regressions: [`test/contracts/critic.contract.test.ts`](../test/contracts/critic.contract.test.ts);
- structured-output boundary: [`test/llm/structured-output.test.ts`](../test/llm/structured-output.test.ts);
- ограниченная историческая итерация: [`1f6caa2`](https://github.com/Zorii4/job-ai-assistant/commit/1f6caa2).

### Взаимодействие человека и агента

Исходная задача Stage 7 появилась после ручного запуска владельца: наиболее объёмный
шаг Critic регулярно упирался в timeout/output budget, а повтор всей цепочки заново
увеличивал ожидание и стоимость. Агент предложил сменить профиль Critic, ограничить
контракт и добавить model-level retry. Владелец принял bounded contract и отдельный
fallback, но отклонил изменение private prompt; одновременно потребовал не повторять
уже успешные Analyst и Producer.

При разборе была найдена ещё одна ошибка границы доверия: модель сама возвращала
`decision` и `reviewStatus`, поэтому terminal status мог расходиться с severity её же
findings. Решение владельца — выводить оба поля детерминированно в приложении. Результат
проверен contract/retry regressions, worker tests и полным набором проверок
[PR #11](https://github.com/Zorii4/job-ai-assistant/pull/11). Persisted checkpoints,
которые не поместились в эту итерацию, затем были реализованы отдельно в
[PR #19](https://github.com/Zorii4/job-ai-assistant/pull/19).

### Оставшийся риск

Строгий контракт доказывает согласованность формы и итогового статуса, но не гарантирует,
что модель найдёт каждое ошибочное утверждение. Качество содержательной проверки всё ещё
требует human review и закрытых evaluation cases.

## Evidence case study 2: private prompt bundle без сломанного public clone

### Проблема

Production prompt files должны оставаться закрытыми, но прямые imports ignored-файлов
делали бы публичный clean clone несобираемым. Публикация placeholder prompts на том же
пути создала бы риск случайно закоммитить рабочий текст.

### Инварианты и решение владельца

Владелец выбрал один source-visible репозиторий с private local overlay. Перенос границы
не должен менять prompt text, prompt version, модель, порядок агентов или
`finalMarkdown` contract.

Workflow получает typed `InitialWorkflowPromptBundle`. Public mock composition использует
tracked детерминированный bundle; real mode загружает fixed ignored overlay и завершается
configuration error до LLM-вызова, если bundle отсутствует или malformed.

### Acceptance criteria

- build и tests проходят без `src/prompts/`;
- mock workflow воспроизводим и не выдаётся за реальный AI-result;
- real mode без private overlay fail-fast до network call;
- malformed bundle отклоняется runtime validation;
- prompt text не попадает в frontend, logs или diagnostic error;
- agent modules не импортируют production prompt files напрямую.

### Доказательство

- typed loader и mock composition: [`src/ai/initialWorkflowPromptBundle.ts`](../src/ai/initialWorkflowPromptBundle.ts);
- boundary regressions: [`test/prompt-bundle-boundary.test.ts`](../test/prompt-bundle-boundary.test.ts);
- public-safety policy tests: [`test/public-repository-safety.test.ts`](../test/public-repository-safety.test.ts);
- ограниченный refactor commit: [`c48cdb6`](https://github.com/Zorii4/job-ai-assistant/commit/c48cdb6).

### Оставшийся риск

Локальный ignored overlay подходит для разработки, но безопасная доставка production
prompts на alpha worker остаётся отдельной infrastructure-задачей. Public scanner не
заменяет ручной content review.

## Evidence case study 3: атомарная квота и ID-only jobs

### Проблема

Долгий multi-step workflow нельзя удерживать внутри HTTP-запроса. Передача полного
resume/vacancy text в очередь увеличила бы распространение пользовательских данных, а
повторная доставка job могла бы повторно списать квоту или создать duplicate result.

### Инварианты и решение владельца

Продуктовый инвариант требует считать одну вакансию одной product unit: initial
analysis, HR preparation и post-interview. Технический retry не должен расходовать
новую unit. Очередь получает только IDs, а worker загружает сохранённые owner-scoped
snapshots из PostgreSQL.

Для нового run API в одной transaction проверяет пользователя, ownership, лимит двух
active runs и lifetime quota, создаёт `AnalysisRun` и резервирует unit. Failed retry
переиспользует этот run без нового списания. Если enqueue не удался, резерв возвращается.
Worker atomically claim-ит run, а unique constraints и idempotent inserts защищают
result и Artifacts от duplicate delivery.

### Acceptance criteria

- job schema отклоняет `resumeText`, `vacancyText` и другие лишние поля;
- два конкурентных launch request не обходят capacity/quota;
- одиннадцатая ALPHA unit отклоняется;
- queue/terminal technical failure возвращает резерв;
- duplicate delivery не запускает второй workflow и не создаёт duplicate Artifact;
- ownership проверяется до чтения, запуска, retry и удаления;
- не более трёх manual retry разрешено только для `FAILED` run.

### Доказательство

- transaction и product rules: [`apps/api/src/applications/applications.service.ts`](../apps/api/src/applications/applications.service.ts);
- ID-only schemas: [`packages/contracts/src/index.ts`](../packages/contracts/src/index.ts);
- queue boundary tests: [`apps/api/test/jobs.service.test.ts`](../apps/api/test/jobs.service.test.ts);
- quota/ownership/concurrency tests: [`apps/api/test/applications.service.test.ts`](../apps/api/test/applications.service.test.ts);
- worker idempotency/recovery tests: [`apps/worker/test/initial-analysis.worker.test.ts`](../apps/worker/test/initial-analysis.worker.test.ts);
- исходный vertical slice: [PR #4](https://github.com/Zorii4/job-ai-assistant/pull/4).

### Оставшийся риск

Локальные tests подтверждают transaction и duplicate-delivery semantics, но реальные
provider limits, production database sizing и стоимость двух параллельных workflows
должны быть проверены на инфраструктуре закрытой альфы.

Factual audit Stage 12 обнаружил, что manual retry обходил reservation после возврата
unit, поэтому второй terminal failure мог занизить usage counter. В follow-up итерации
retry проведён через ту же atomic quota reservation до изменения failed run. Если quota
занята, run остаётся `FAILED`; queue rollback и worker terminal path освобождают unit
ровно текущей попытки. Поведение закреплено в
[`applications.service.test.ts`](../apps/api/test/applications.service.test.ts) и
[`initial-analysis.worker.test.ts`](../apps/worker/test/initial-analysis.worker.test.ts).

## Публичный след итераций

История не переписывалась для portfolio narrative. Публичные PR показывают фактическое
расширение одного и того же продукта:

| Итерация | Scope | Проверки, записанные в PR |
| --- | --- | --- |
| [PR #10](https://github.com/Zorii4/job-ai-assistant/pull/10) | File-only intake, frontend boundaries и review улучшения Этапа 6.5. | tests, build, Prisma/public-safety checks |
| [PR #19](https://github.com/Zorii4/job-ai-assistant/pull/19) | Persisted checkpoints и recovery прерванного initial workflow. | tests, build, Prisma validation, public-safety, diff check |
| [PR #21](https://github.com/Zorii4/job-ai-assistant/pull/21) | Сквозной ручной review: lifecycle, progressive HR-flow, Markdown, controls и bounded retry. | tests, build, Prisma validation, public-safety, diff check |

Наличие `AGENTS.md` само по себе не доказывает качество agent-assisted разработки.
Доказательством считаются конкретное решение владельца, ограниченный diff, найденная
проблема, тесты и оставшийся риск, которые можно проследить в case study и PR.

## Как поддерживать документ

Новый case study добавляется только после фактической reviewable итерации. Он обязан
ссылаться на public code/tests/PR, отделять решение владельца от работы агента и не
публиковать private spec, production prompts, реальные данные или evaluation corpus.
