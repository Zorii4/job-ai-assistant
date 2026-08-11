import { useState } from 'react';

import { FileUpload } from './FileUpload';

export function FileUploadPreview() {
  const [file, setFile] = useState<File | null>(() => new File(['resume'], 'resume.pdf', { type: 'application/pdf' }));
  return <main className="app-shell"><h1>FileUpload — состояния</h1><FileUpload id="file-upload-preview-default" label="По умолчанию" file={null} onFileChange={setFile} /><FileUpload id="file-upload-preview-hover" label="Hover" file={null} onFileChange={setFile} previewState="hover" /><FileUpload id="file-upload-preview-focus" label="Focus" file={null} onFileChange={setFile} previewState="focus" /><FileUpload id="file-upload-preview-active" label="Active" file={null} onFileChange={setFile} previewState="active" /><FileUpload id="file-upload-preview-disabled" label="Disabled" file={null} onFileChange={setFile} disabled /><FileUpload id="file-upload-preview-loading" label="Loading" file={file} onFileChange={setFile} previewState="loading" /><FileUpload id="file-upload-preview-error" label="Error" file={null} onFileChange={setFile} previewState="error" /><FileUpload id="file-upload-preview-success" label="Success" file={file} onFileChange={setFile} previewState="success" /></main>;
}
