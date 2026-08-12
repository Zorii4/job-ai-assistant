import { ResumeMarkdownPreview } from '../resumes/ResumeMarkdownPreview';

export function FullReportEditor({ markdown, state, hasEditedVersion, onChange, onReset }: { markdown: string; state: 'saving' | 'saved' | 'error'; hasEditedVersion: boolean; onChange: (value: string) => void; onReset: () => void }) {
  const label = state === 'saving' ? 'Сохраняем…' : state === 'error' ? 'Не удалось сохранить' : 'Сохранено';
  return <section className="analysis-report" aria-labelledby="analysis-report-title"><div className="artifact-card-heading"><h2 id="analysis-report-title">Полный отчёт</h2><p className={`artifact-save-state artifact-save-state--${state}`} role="status">{label}</p></div><label className="field"><span>Markdown-версия</span><textarea value={markdown} onChange={(event) => onChange(event.target.value)} rows={16} maxLength={50_000} /></label><ResumeMarkdownPreview markdown={markdown} />{hasEditedVersion && <button className="button button--secondary" type="button" onClick={onReset} disabled={state === 'saving'}>Вернуть AI-версию</button>}</section>;
}
