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
  artifacts,
}: {
  artifacts: ArtifactSummary[];
}) {
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
            <MarkdownReport markdown={artifact.generatedContent} />
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
