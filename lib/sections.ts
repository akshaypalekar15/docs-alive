export type Block = {
  /** Stable per document: assigned once during parsing, survives reordering. */
  id: string;
  html: string;
  /** 1-3 for headings, 0 for everything else. */
  level: number;
  text: string;
};

export type Section = {
  id: string;
  level: number;
  title: string;
  blocks: Block[];
};

/** Section id for the content that appears before the first heading. */
export const LEAD_ID = 's-lead';

/**
 * A section is a heading plus every block up to the next heading, so moving a
 * heading moves its content with it and documents stay coherent.
 */
export function groupSections(blocks: Block[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const block of blocks) {
    if (block.level > 0) {
      current = { id: `s-${block.id}`, level: block.level, title: block.text, blocks: [block] };
      sections.push(current);
    } else if (current) {
      current.blocks.push(block);
    } else {
      current = { id: LEAD_ID, level: 0, title: '', blocks: [block] };
      sections.push(current);
    }
  }

  return sections;
}

/** djb2 - a short, stable key for a document's content. */
export function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const STORAGE_PREFIX = 'docs-alive-order:';

export function storageKeyFor(html: string): string {
  return STORAGE_PREFIX + hashKey(html);
}

/**
 * Returns the stored order when it is still valid for these sections, else the
 * natural document order. Ids that no longer exist are dropped and any new
 * sections are appended, so an outdated entry can never hide content.
 */
export function restoreOrder(stored: string | null, sections: Section[]): string[] {
  const natural = sections.map((s) => s.id);
  if (!stored) return natural;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return natural;

    const valid = parsed.filter((id): id is string => typeof id === 'string' && natural.includes(id));
    const seen = new Set(valid);
    return [...valid, ...natural.filter((id) => !seen.has(id))];
  } catch {
    return natural;
  }
}