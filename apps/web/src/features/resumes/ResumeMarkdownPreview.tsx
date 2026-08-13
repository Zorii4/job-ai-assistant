import type { ReactNode } from 'react';

type MarkdownBlock = { type: 'heading'; level: number; text: string } | { type: 'list'; items: string[] } | { type: 'table'; rows: string[][] } | { type: 'quote'; text: string } | { type: 'code'; text: string } | { type: 'paragraph'; text: string };

export function parseResumeMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const normalizedMarkdown = markdown.replace(/^(#{1,4}\s+.+)$/gm, '\n$1\n');
  for (const block of normalizedMarkdown.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)) {
    const lines = block.split('\n'); const heading = /^(#{1,4})\s+(.+)$/.exec(lines[0] ?? '');
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); continue; }
    if (block.startsWith('```') && block.endsWith('```')) { blocks.push({ type: 'code', text: lines.slice(1, -1).join('\n') }); continue; }
    if (lines.every((line) => /^>\s?/.test(line))) { blocks.push({ type: 'quote', text: lines.map((line) => line.replace(/^>\s?/, '')).join('\n') }); continue; }
    if (lines.every((line) => /^[-*+]\s+/.test(line))) { blocks.push({ type: 'list', items: lines.map((line) => line.replace(/^[-*+]\s+/, '')) }); continue; }
    if (lines.length >= 2 && /^\|?\s*:?-{3,}/.test(lines[1]?.trim() ?? '')) { blocks.push({ type: 'table', rows: lines.filter((_, index) => index !== 1).map(parseTableRow) }); continue; }
    blocks.push({ type: 'paragraph', text: block });
  }
  return blocks;
}

export function ResumeMarkdownPreview({ markdown }: { markdown: string }) {
  return <div className="resume-markdown-preview" aria-label="Предпросмотр Markdown-версии">{parseResumeMarkdown(markdown).map((block, index) => {
    if (block.type === 'heading') return block.level === 1 ? <h3 key={index}>{renderInline(block.text)}</h3> : <h4 key={index}>{renderInline(block.text)}</h4>;
    if (block.type === 'list') return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>;
    if (block.type === 'table') return <div className="resume-markdown-preview__table-wrap" key={index}><table><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} scope="col">{renderInline(cell)}</th> : <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>)}</tbody></table></div>;
    if (block.type === 'quote') return <blockquote key={index}>{renderInline(block.text)}</blockquote>;
    if (block.type === 'code') return <pre key={index}><code>{block.text}</code></pre>;
    return <p key={index}>{renderInline(block.text)}</p>;
  })}</div>;
}

function renderInline(text: string): ReactNode[] { const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g); return parts.map((part, index) => { const match = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part); const safeUrl = match ? getSafeHttpUrl(match[2]) : null; return match && safeUrl ? <a key={index} href={safeUrl} target="_blank" rel="noreferrer">{match[1]}</a> : part; }); }
function parseTableRow(line: string): string[] { return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()); }

export function getSafeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
