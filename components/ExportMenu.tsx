'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { readBlocks, toDocxBlob, toHtmlDocument, toMarkdown } from '@/lib/exporter';

type Props = {
  doc: RefObject<HTMLElement | null>;
  /** Original file name, used to name the download. */
  name: string;
  /** Highlights the CTA when sections or tables have been changed. */
  altered: boolean;
};

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const base = (name: string) => name.replace(/\.[^.]+$/, '') || 'document';

export default function ExportMenu({ doc, name, altered }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const root = doc.current;
  const stem = base(name);

  const run = async (kind: 'md' | 'html' | 'docx' | 'pdf') => {
    if (!root) return;
    // PDF is the browser's own print pipeline, driven by the print stylesheet.
    if (kind === 'pdf') {
      setOpen(false);
      window.print();
      return;
    }
    setBusy(kind);
    // Yield so the busy state paints before the (synchronous) DOM walk.
    await new Promise((r) => setTimeout(r, 0));
    try {
      const blocks = readBlocks(root);
      if (kind === 'md') {
        download(new Blob([toMarkdown(blocks)], { type: 'text/markdown' }), `${stem}.md`);
      } else if (kind === 'html') {
        download(new Blob([toHtmlDocument(root, name)], { type: 'text/html' }), `${stem}.html`);
      } else {
        download(await toDocxBlob(blocks), `${stem}.docx`);
      }
      setOpen(false);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="export" ref={wrap}>
      <motion.button
        className="export-btn"
        data-altered={altered}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 24 }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        {altered ? 'Export changes' : 'Export'}
      </motion.button>

      {open && (
        <motion.div
          className="export-menu"
          role="menu"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button role="menuitem" onClick={() => run('docx')} disabled={busy !== ''}>
            <span>Word document</span>
            <small>{busy === 'docx' ? 'Building…' : '.docx'}</small>
          </button>
          <button role="menuitem" onClick={() => run('pdf')} disabled={busy !== ''}>
            <span>PDF</span>
            <small>via print</small>
          </button>
          <button role="menuitem" onClick={() => run('html')} disabled={busy !== ''}>
            <span>Web page</span>
            <small>{busy === 'html' ? 'Building…' : '.html'}</small>
          </button>
          <button role="menuitem" onClick={() => run('md')} disabled={busy !== ''}>
            <span>Markdown</span>
            <small>{busy === 'md' ? 'Building…' : '.md'}</small>
          </button>
        </motion.div>
      )}
    </div>
  );
}