# GitHub-настройки для публичного портфолио

Этот документ фиксирует целевую конфигурацию GitHub для репозитория. Она применяется
владельцем перед сменой visibility; сама смена visibility требует отдельного явного
подтверждения.

## Репозиторий

- Description: `Портфолио-проект: privacy-aware AI workflow для анализа соответствия резюме и вакансии на React, NestJS и TypeScript.`
- Topics: `typescript`, `react`, `vite`, `nestjs`, `prisma`, `postgresql`, `ai-workflow`, `portfolio`.
- Default branch: `master`.
- Website/demo: не указывать, пока нет отдельной публичной демо-среды.
- Social preview: использовать только asset с подтверждёнными правами; до этого оставить
  стандартный preview.

## Защита ветки и CI

Для `master` включить ruleset, запрещающий force push и удаление ветки. Не требовать
pull request или обязательный review: они не нужны персональному source-visible
репозиторию без процесса внешних contributions. После первого успешного запуска
workflow добавить required checks `Public checks / verify` и
`CodeQL / Analyze JavaScript and TypeScript`.

Workflow-файлы не получают production secrets и используют только mock mode. Обычный
pull request не должен выполнять реальный LLM-вызов. Для Actions оставить default
`GITHUB_TOKEN` read-only; workflow получает дополнительные права только там, где это
нужно для загрузки CodeQL results.

## Security и автоматизация

- Включить Dependabot alerts, dependency graph и monthly Dependabot version updates.
- Включить secret scanning и push protection после public visibility.
- До смены visibility принимать security reports через `SECURITY.md`; GitHub private
  vulnerability reporting включить сразу после смены visibility, потому что GitHub
  предоставляет эту функцию public repositories.
- Включить CodeQL для JavaScript/TypeScript.
- Запретить доступ forked pull requests к secrets и запретить workflows, которым нужны
  write permissions, запускаться с их кода.
- Задать хранение Actions logs/artifacts на 60 дней; текущие workflows artifacts не
  создают.

## Issues, discussions и releases

В соответствии с текущей source-visible моделью внешние contributions не принимаются.
Оставить GitHub Issues и Discussions выключенными: репозиторий не является площадкой
для публичной поддержки или совместной разработки. Сообщения о потенциальных
уязвимостях принимаются только через канал из `SECURITY.md`.

Не создавать Releases, packages или deployment на первом этапе. Эти сущности нельзя
отключить отдельной настройкой GitHub; отсутствие проверяется перед публикацией и при
финальном audit. Теги и Releases возможны только после отдельного решения владельца.
