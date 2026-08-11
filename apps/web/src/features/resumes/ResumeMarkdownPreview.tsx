type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'paragraph'; text: string };

export function parseResumeMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  for (const block of markdown.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)) {
    const lines = block.split('\n');
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0] ?? '');
    if (heading !== null) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); continue; }
    if (lines.every((line) => /^[-*+]\s+/.test(line))) { blocks.push({ type: 'list', items: lines.map((line) => line.replace(/^[-*+]\s+/, '')) }); continue; }
    if (lines.length >= 2 && /^\|?\s*:?-{3,}/.test(lines[1]?.trim() ?? '')) { blocks.push({ type: 'table', rows: lines.filter((_, index) => index !== 1).map(parseTableRow) }); continue; }
    blocks.push({ type: 'paragraph', text: block });
  }

  return blocks;
}

export function ResumeMarkdownPreview({ markdown }: { markdown: string }) {
  return <div className="resume-markdown-preview" aria-label="Предпросмотр обезличенной Markdown-версии">
    {parseResumeMarkdown(markdown).map((block, index) => {
      if (block.type === 'heading') {
        if (block.level === 1) return <h3 key={index}>{block.text}</h3>;
        return <h4 key={index}>{block.text}</h4>;
      }
      if (block.type === 'list') return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
      if (block.type === 'table') return <div className="resume-markdown-preview__table-wrap" key={index}><table><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} scope="col">{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
      return <p key={index}>{block.text}</p>;
    })}
  </div>;
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}
