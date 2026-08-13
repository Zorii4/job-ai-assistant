import { ResumeMarkdownPreview } from '../resumes/ResumeMarkdownPreview';

export function FullReportEditor({ markdown }: { markdown: string }) {
  return <section className="analysis-report" aria-labelledby="analysis-report-title"><h2 id="analysis-report-title">Полный отчёт</h2><ResumeMarkdownPreview markdown={markdown} /></section>;
}
