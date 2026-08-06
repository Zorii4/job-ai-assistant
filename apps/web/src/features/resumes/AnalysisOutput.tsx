import type { ArtifactSummary } from '@job-ai-assistant/contracts';
export function MarkdownReport({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <section className="analysis-report" aria-labelledby="analysis-report-title">
      <h2 id="analysis-report-title">Результат анализа</h2>
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0] ?? '');

        if (heading !== null) {
          const content = heading[2];
          if (heading[1].length === 1) return <h3 key={index}>{content}</h3>;
          return <h4 key={index}>{content}</h4>;
        }

        if (lines.every((line) => line.startsWith('- '))) {
          return <ul key={index}>{lines.map((line) => <li key={line}>{line.slice(2)}</li>)}</ul>;
        }

        return <p key={index}>{block}</p>;
      })}
    </section>
  );
}

export function ArtifactMaterials({
  artifacts, drafts, states, onDraftChange, onReset,
}: {
  artifacts: ArtifactSummary[];
  drafts: Record<string, string>;
  states: Record<string, 'saving' | 'saved' | 'error'>;
  onDraftChange: (artifactId: string, value: string) => void;
  onReset: (artifact: ArtifactSummary) => void;
}) {
  return (
    <section className="artifact-materials" aria-labelledby="artifact-materials-title">
      <div className="artifact-materials-heading">
        <div>
          <p className="eyebrow">МАТЕРИАЛЫ</p>
          <h2 id="artifact-materials-title">Черновики для следующего шага</h2>
        </div>
        <p>Изменения сохраняются автоматически.</p>
      </div>
      <p className="material-warning" role="note">
        <span>WARNING · CONDITIONAL</span>
        Материалы готовы. Проверьте отмеченные AI-предположения перед отправкой. Отправка остаётся ручным действием пользователя.
      </p>
      <div className="artifact-list">
        {artifacts.map((artifact) => (
          <article className="artifact-card" key={artifact.id}>
            <div className="artifact-card-heading">
              <h3>{getArtifactTitle(artifact.type)}</h3>
              <p className={`artifact-save-state artifact-save-state--${states[artifact.id] ?? 'saved'}`} role="status">
                {getArtifactStateLabel(states[artifact.id] ?? 'saved')}
              </p>
            </div>
            <label className="field">
              <span className="sr-only">{getArtifactTitle(artifact.type)}</span>
              <textarea
                value={drafts[artifact.id] ?? artifact.editedContent ?? artifact.generatedContent}
                onChange={(event) => onDraftChange(artifact.id, event.target.value)}
                rows={8}
                maxLength={50_000}
              />
            </label>
            {artifact.editedContent !== null && (
              <button className="button button--secondary" type="button" onClick={() => onReset(artifact)} disabled={states[artifact.id] === 'saving'}>
                {states[artifact.id] === 'saving' ? 'Возвращаем…' : 'Вернуть AI-версию'}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function getArtifactTitle(type: ArtifactSummary['type']): string {
  return {
    RESUME_RECOMMENDATIONS: 'Блоки для резюме',
    COVER_LETTER: 'Сопроводительное письмо',
    RECRUITER_MESSAGE: 'Сообщение рекрутеру',
    FOLLOW_UP: 'Follow-up',
  }[type];
}

function getArtifactStateLabel(state: 'saving' | 'saved' | 'error'): string {
  if (state === 'saving') return 'Сохраняем…';
  if (state === 'error') return 'Не удалось сохранить';
  return 'Сохранено';
}
