'use client';
import { useEffect, useRef } from 'react';

type Props = {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  /** A single-line field, used for table cells, where newlines make no sense. */
  multiline?: boolean;
  label: string;
  className?: string;
};

export default function SectionEditor({
  initial,
  onSave,
  onCancel,
  multiline = true,
  label,
  className = 'sec-editor',
}: Props) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  // Unmounting a focused field does not reliably fire blur, so Escape records
  // its intent here and any later blur becomes a no-op.
  const cancelled = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);

    if (!multiline) return;
    const grow = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    grow();
    el.addEventListener('input', grow);
    return () => el.removeEventListener('input', grow);
  }, [multiline]);

  const commit = () => {
    if (!cancelled.current) onSave(ref.current?.value ?? initial);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelled.current = true;
      onCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };

  if (!multiline) {
    return (
      <input
        ref={ref}
        type="text"
        className={className}
        defaultValue={initial}
        aria-label={label}
        spellCheck
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <textarea
      ref={ref}
      className={className}
      defaultValue={initial}
      aria-label={label}
      spellCheck
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}