# GitHub-настройки публичного portfolio-репозитория

## Текущий статус

Проверено 26 августа 2026 года для
[`Zorii4/job-ai-assistant`](https://github.com/Zorii4/job-ai-assistant):

- visibility — `PUBLIC`;
- default branch — `master`;
- baseline master commit на момент начала Stage 12 —
  [`0c43f31`](https://github.com/Zorii4/job-ai-assistant/commit/0c43f31437a71431a8aa286b62e6f78170791a64);
- `Public checks` и `CodeQL` для baseline commit завершены успешно; checks текущей
  revision оцениваются отдельно в её PR;
- ruleset `protect-master` активен;
- GitHub Issues и Discussions выключены;
- website/demo не указан, потому что публичного deployment нет;
- проект остаётся source-visible, external contributions не принимаются.

Repository description:

> Проект: privacy-aware AI workflow для анализа соответствия резюме и вакансии на
> React, NestJS и TypeScript.

## Branch protection и CI

Ruleset для `master` запрещает удаление и non-fast-forward updates. Изменения должны
пройти public checks и CodeQL согласно фактической GitHub-конфигурации.

Workflows:

- используют детерминированный mock mode и не вызывают реальную платную LLM;
- не получают production prompts или пользовательские данные;
- используют least-privilege `GITHUB_TOKEN`;
- не дают forked code доступ к repository secrets;
- не создают deployment, release или package как побочный эффект обычного PR.

Состояние CI оценивается для конкретного commit и branch. Сбой отдельной Dependabot- или
feature-ветки не выдаётся за сбой `master`, но требует обычного review до merge.

## Security controls

- Dependency graph и Dependabot включены.
- Secret scanning и push protection включены для public repository.
- CodeQL анализирует JavaScript/TypeScript.
- GitHub private vulnerability reporting используется для безопасного сообщения об
  уязвимости.
- Открытые dependency/security alerts рассматриваются отдельной ограниченной задачей;
  публичный документ не обещает постоянное отсутствие alerts.
- Workflow logs и artifacts не должны содержать production secrets, prompts или
  пользовательские тексты.

Канал responsible disclosure и действия при утечке описаны в
[SECURITY.md](../SECURITY.md).

## Portfolio и community boundary

- README не называет проект open source и содержит source-visible notice.
- Отдельный `LICENSE`, `CONTRIBUTING.md`, DCO и CLA не добавляются без нового решения
  владельца.
- Issues, Discussions и Wiki не используются как public support/community process.
- Releases, packages, GitHub Pages и public deployment не создаются на текущем этапе.
- Social preview добавляется только из asset с подтверждёнными правами и privacy review.

## Постоянные проверки

Перед публичным merge:

1. Просмотреть scope и diff.
2. Запустить релевантные tests/build и `npm run check:public-safety`.
3. Проверить новые fixtures, screenshots и docs на PII, private prompts и права.
4. Убедиться, что public status и file classification остаются актуальными.
5. Проверить CI и security/dependency alerts, относящиеся к изменению.

Перед изменением visibility, license model, community-функций, Releases, packages или
deployment требуется отдельное решение владельца и новый go/no-go review.
