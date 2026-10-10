'use client';
import { useState } from 'react';
import { marked } from 'marked';
import Viewer from '@/components/Viewer';
import Background from '@/components/Background';
import Cursor from '@/components/Cursor';
import ThemeToggle from '@/components/ThemeToggle';

async function toHtml(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    const res = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return res.value;
  }
  if (ext === 'md' || ext === 'txt') return marked.parse(await file.text()) as string;
  throw new Error('Unsupported file. Upload a .docx, .md or .txt file.');
}

export default function Home() {
  const [html, setHtml] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function handle(file?: File) {
    if (!file) return;
    setError('');
    try {
      setHtml(await toHtml(file));
      setName(file.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (html) return <Viewer html={html} name={name} onReset={() => setHtml(null)} />;

  return (
    <>
      <Background />
      <Cursor />
      <ThemeToggle />
      <main className="landing">
        <h1>Upload a document. Read it, don&apos;t scroll it.</h1>
        <label
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files[0]); }}
        >
          <input type="file" accept=".docx,.md,.txt" hidden onChange={(e) => handle(e.target.files?.[0])} />
          Drop a .docx, .md or .txt file here, or click to choose one
        </label>
        {error && <p className="error">{error}</p>}
      </main>
    </>
  );
}
