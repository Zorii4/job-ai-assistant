import type { ArtifactSummary } from '@job-ai-assistant/contracts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownReport({ markdown, label }: { markdown: string; label?: string }) {
  return (
    <div className="markdown-content" aria-label={label}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export function ArtifactMaterials({ artifacts }: { artifacts: ArtifactSummary[] }) {
  return (
    <section className="artifact-materials" aria-labelledby="artifact-materials-title">
      <div className="artifact-materials-heading">
        <div>
          <p className="eyebrow">МАТЕРИАЛЫ</p>
          <h2 id="artifact-materials-title">Черновики для следующего шага</h2>
        </div>
        <p>Выделите и скопируйте нужный фрагмент вручную.</p>
      </div>
      <p className="material-warning" role="note">
        <span>WARNING · CONDITIONAL</span>
        Материалы готовы. Проверьте отмеченные AI-предположения перед отправкой. Отправка остаётся ручным действием пользователя.
      </p>
      <div className="artifact-list">
        {artifacts.map((artifact) => (
          <article className="artifact-card" key={artifact.id}>
            <div className="artifact-card-heading"><h3>{getArtifactTitle(artifact.type)}</h3></div>
            <MarkdownReport markdown={artifact.generatedContent} label={getArtifactTitle(artifact.type)} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function WorkflowArtifact({
  artifact,
  title,
  description,
  warning,
}: {
  artifact: ArtifactSummary;
  title: string;
  description: string;
  warning?: string;
}) {
  return <section className="workflow-artifact" aria-labelledby={`artifact-${artifact.id}`}>
    <div className="workflow-artifact__heading">
      <div>
        <h2 id={`artifact-${artifact.id}`}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    {warning !== undefined && <p className="material-warning" role="note">{warning}</p>}
    <MarkdownReport markdown={artifact.generatedContent} label={title} />
  </section>;
}

function getArtifactTitle(type: ArtifactSummary['type']): string {
  return {
    RESUME_RECOMMENDATIONS: 'Блоки для резюме',
    COVER_LETTER: 'Сопроводительное письмо',
    RECRUITER_MESSAGE: 'Сообщение рекрутеру',
    FOLLOW_UP: 'Follow-up',
    HR_SCREENING_PREPARATION: 'Подготовка к HR-скринингу',
    POST_INTERVIEW_REVIEW: 'Разбор HR-скрининга',
    HR_CLOSING_MESSAGE: 'Закрывающее сообщение HR',
  }[type];
}
