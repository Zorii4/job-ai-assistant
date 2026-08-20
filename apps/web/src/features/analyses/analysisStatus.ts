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

export function getAnalysisErrorLabel(errorCode: string | null): string {
  if (errorCode?.startsWith('ANALYST_')) return 'Сбой на этапе анализа соответствия.';
  if (errorCode?.startsWith('PRODUCER_')) return 'Сбой на этапе подготовки материалов.';
  if (errorCode?.startsWith('CRITIC_')) return 'Сбой на этапе проверки материалов.';
  if (errorCode?.startsWith('FINAL_')) return 'Сбой на этапе сборки результата.';
  if (errorCode === 'QUEUE_UNAVAILABLE') return 'Не удалось поставить анализ в очередь.';
  return 'Анализ завершился с технической ошибкой.';
}

export function isActiveAnalysisStatus(status: AnalysisRunSummary['status']): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}
