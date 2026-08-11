import { useRef, useState } from 'react';

const maxFileSizeBytes = 10 * 1024 * 1024;
const allowedExtensions = new Set(['pdf', 'md', 'txt']);
const allowedMimeTypes = new Set(['application/pdf', 'text/markdown', 'text/plain', '']);

export type FileUploadMetadata = Pick<File, 'name' | 'size' | 'type'>;

export function getFileValidationError(file: FileUploadMetadata): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === undefined || !allowedExtensions.has(extension) || !allowedMimeTypes.has(file.type)) {
    return 'Выберите файл PDF, MD или TXT.';
  }
  if (file.size === 0) return 'Выбранный файл пуст. Выберите другой файл.';
  if (file.size > maxFileSizeBytes) return 'Размер файла не должен превышать 10 МБ.';
  return null;
}

export function FileUpload({ id, label, file, onFileChange, disabled, description, previewState }: { id: string; label: string; file: File | null; onFileChange: (file: File | null) => void; disabled?: boolean; description?: string; previewState?: 'hover' | 'focus' | 'active' | 'loading' | 'error' | 'success' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const selectFile = (candidate: File | null) => {
    if (candidate === null) return;
    const error = getFileValidationError(candidate);
    setValidationError(error);
    onFileChange(error === null ? candidate : null);
  };
  const clearFile = () => { setValidationError(null); onFileChange(null); if (inputRef.current !== null) inputRef.current.value = ''; };
  const state = previewState ?? (disabled ? 'loading' : validationError !== null ? 'error' : file !== null ? 'success' : 'default');
  const isDisabled = disabled || previewState === 'loading';
  const errorMessage = validationError ?? (previewState === 'error' ? 'Не удалось проверить файл. Выберите другой файл.' : null);
  return <section className={`file-upload${previewState !== undefined ? ` is-${previewState}` : ''}`} data-state={state} aria-labelledby={`${id}-label`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!isDisabled) selectFile(event.dataTransfer.files.item(0)); }}>
    <input ref={inputRef} id={id} className="file-upload__input" type="file" accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} disabled={disabled} aria-describedby={`${id}-description ${validationError !== null ? `${id}-error` : ''}`} aria-invalid={validationError !== null} />
    <div className="file-upload__content"><div><span id={`${id}-label`} className="file-upload__label">{label}</span><p id={`${id}-description`} className="file-upload__description">{description ?? 'PDF, MD или TXT · до 10 МБ'}</p></div>{file !== null && <p className="file-upload__file" role="status">{file.name} · {getFileTypeLabel(file)} · {formatFileSize(file.size)}</p>}{errorMessage !== null && <p id={`${id}-error`} className="file-upload__error" role="alert">{errorMessage}</p>}</div>
    <div className="file-upload__actions"><button className="button button--secondary" type="button" onClick={() => inputRef.current?.click()} disabled={isDisabled}>{file === null ? 'Выбрать файл' : 'Заменить'}</button>{file !== null && <button className="button button--secondary" type="button" onClick={clearFile} disabled={isDisabled}>Удалить</button>}</div>
  </section>;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

function getFileTypeLabel(file: File): string {
  return file.name.split('.').pop()?.toUpperCase() ?? 'ФАЙЛ';
}
