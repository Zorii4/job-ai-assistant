# Specification-driven development

## Подход

Проект развивается небольшими ограниченными задачами. Для каждой задачи сначала
фиксируется проверяемая проблема и границы, затем реализуется минимальное изменение,
добавляются тесты и выполняется review результата.

```text
problem
  -> private normative specification
  -> bounded implementation task
  -> agent guardrails
  -> code and migration
  -> tests
  -> review against acceptance criteria
```

Внутренние спецификации и owner-only инструкции не публикуются. Публичная
документация описывает только факты, подтверждённые кодом и тестами.

## Практики

- Не расширять product scope в ходе несвязанной задачи.
- Не смешивать изменение architecture, production prompts, модели и final output
  contract в одном изменении.
- Проверять ownership на сервере, а не в интерфейсе.
- Считать пользовательский текст и документы недоверенными данными.
- Не передавать в LLM source resume text.
- Хранить production prompts и реальные evaluation-материалы вне tracked-кода.
- Перед завершением задачи проверять affected public docs и file classification.

## Case study: application/AI boundary

### Проблема

Исходный multi-agent workflow был связан с legacy adapters и файловым сохранением.
Это усложняло повторное использование workflow из другого интерфейса.

### Ограничение

Нельзя менять порядок Analyst → Producer → Critic → revision → Orchestrator,
смысл output или legacy adapter в рамках выделения границы.

### Решение

Application use case содержит orchestration-level lifecycle, `src/ai` запускает
workflow, а persistence скрыт за портом. CLI и Telegram остаются adapters, а не
копиями бизнес-логики.

### Альтернатива и реализация

Альтернатива — перенести flow в конкретный HTTP- или Telegram-controller. Она создала бы
две реализации бизнес-логики и была отклонена. Вместо этого добавлен application use
case и явный persistence port; legacy adapters вызывают этот путь без изменения
порядка агентов.

### Доказательство

Тесты проверяют, что application use case делегирует запуск workflow, agent-модули
не зависят от Telegram, а file persistence продолжает работать как legacy adapter.

### Оставшийся риск

Run persistence пока файловый. Database-backed jobs и worker — отдельный
планируемый этап, а не скрытая часть текущей реализации.

## Case study: privacy-safe resume pipeline

### Проблема

Резюме содержит персональные данные, но пользователю нужен editable вариант перед
использованием AI.

### Ограничение

Source text не должен возвращаться в public API response; доступ к записи другого
пользователя недопустим. Файловый input должен ограничиваться поддерживаемыми
типами и очищаться после извлечения.

### Решение

Resume draft хранит source и sanitized версии раздельно. Public contract содержит
только разрешённые поля; пользователь редактирует и подтверждает sanitized text.
Серверные queries для preview, update, confirm и delete включают `userId`.

### Альтернатива и реализация

Альтернатива — хранить только один текст и возвращать его для редактирования. Она не
позволяла бы отделить источник от подтверждённой версии и была отклонена. Реализация
использует раздельные поля, серверную область видимости по `userId`, validation файла и
очистку upload buffer после извлечения текста.

### Доказательство

Unit и API tests проверяют validation, MIME/extension ограничения, отсутствие
source text в response, лимит резюме и невозможность получить или изменить чужое
резюме.

### Оставшийся риск

Техническое обезличивание не является юридической гарантией. До реального LLM
маршрута и внешнего запуска требуется дополнительный privacy/legal review.

## Case study: private prompt boundary

### Проблема

Tracked agent-модули не должны зависеть от закрытых prompt files, иначе public
clone не собирается и граница private overlay становится неявной.

### Ограничение

Нельзя публиковать или переписывать production prompt text ради public build.
Mock mode не должен выглядеть как реальный AI-result.

### Решение

Workflow получает один typed prompt bundle. Mock mode использует безопасные
минимальные prompts для детерминированных тестов; real mode загружает private
overlay и завершает запуск configuration error, если он отсутствует.

### Альтернатива и реализация

Альтернатива — оставить прямые статические imports закрытых prompt-файлов. Она ломала
бы clean clone и делала private boundary неявной. Реализация передаёт typed bundle в
workflow; agent-модули больше не импортируют production prompts напрямую, а mock bundle
остаётся tracked и предназначен только для тестов.

### Доказательство

Regression tests проверяют mock bundle, отсутствие/malformed private bundle и
запрет прямых imports production prompts. Legacy build и mock tests проходят при
временном отсутствии private prompt directory.

### Оставшийся риск

Public mock mode доказывает воспроизводимость кода, а не качество реального AI.
Production evaluation corpus и рабочие результаты остаются закрытыми.

## Изменение процесса

При изменении публичного поведения, архитектуры или статуса функции документация
обновляется в той же задаче. При появлении нового пути или рискованной категории
данных агент предлагает владельцу явную file classification; unknown tracked path
остаётся заблокированным до решения.
