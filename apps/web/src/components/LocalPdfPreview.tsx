import { useEffect, useState } from 'react';

export function isPdfFile(file: File | null): file is File {
  return file !== null && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
}

export function LocalPdfPreview({ file }: { file: File | null }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isPdfFile(file)) { setObjectUrl(null); return; }
    const nextObjectUrl = URL.createObjectURL(file);
    setObjectUrl(nextObjectUrl);
    return () => URL.revokeObjectURL(nextObjectUrl);
  }, [file]);

  if (objectUrl === null) return null;

  return <details className="local-pdf-preview"><summary>Предпросмотр выбранного PDF</summary><p>Файл открыт только в браузере до отправки и не сохраняется для предпросмотра.</p><object data={objectUrl} type="application/pdf" aria-label="Предпросмотр выбранного PDF"><a href={objectUrl} target="_blank" rel="noreferrer">Открыть PDF в новой вкладке</a></object></details>;
}
