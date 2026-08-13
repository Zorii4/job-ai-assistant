import type { AnalysisRunSummary } from '@job-ai-assistant/contracts';

export function getAnalysisRunStatusLabel(status: AnalysisRunSummary['status']): string {
  return {
    QUEUED: 'В очереди',
    RUNNING: 'Выполняется',
    SUCCEEDED: 'Готово',
    FAILED: 'Не удалось завершить',
  }[status];
}

export function getAnalysisStageLabel(stage: string): string {
  return {
    analyst: 'Анализ соответствия',
    producer: 'Подготовка материалов',
    critic: 'Проверка материалов',
    final: 'Сборка результата',
  }[stage.toLowerCase()] ?? 'Выполняем анализ';
}

export function isActiveAnalysisStatus(status: AnalysisRunSummary['status']): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}
