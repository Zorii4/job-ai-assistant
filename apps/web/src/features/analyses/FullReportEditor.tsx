import { MarkdownReport } from '../resumes/AnalysisOutput';

export function FullReportEditor({ markdown }: { markdown: string }) {
  return <section className="analysis-report" aria-labelledby="analysis-report-title"><h2 id="analysis-report-title">Полный отчёт</h2><MarkdownReport markdown={markdown} label="Полный отчёт первоначального анализа" /></section>;
}
