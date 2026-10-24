export type Block = {
  /** Stable per document: assigned once during parsing, survives reordering. */
  id: string;
  html: string;
  /** 1-3 for headings, 0 for everything else. */
  level: number;
  text: string;
  /**
   * Heading ids contained in this block. Bold-paragraph pseudo-headings are
   * <p> elements, so level alone cannot identify them; this is what lets the
   * table of contents be rebuilt in the reader's chosen order.
   */
  headingIds: string[];
  /**
   * True for blocks that plain-text editing must not touch: data tables and
   * image blocks. Both are destroyed by a round-trip through text — a table
   * collapses into pipe-separated rows, an image into a placeholder — so the
   * editor leaves them alone and puts them back exactly where they were. A
   * layout table is not flagged: it only wraps prose, so that prose stays
   * editable.
   */
  preserved?: boolean;
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
 * A heading is a "container" when the next block is another heading: it has no
 * body of its own, just subsections. "2. Tables" followed straight by "2.1" is
 * one such heading. Without this, such a heading becomes a title-only section
 * and dragging it moves nothing but the title.
 */
function isContainer(blocks: Block[], index: number): boolean {
  const next = blocks[index + 1];
  return next !== undefined && next.level > 0;
}

/**
 * A section is a heading plus its content. A container heading absorbs its
 * subsections and everything under them, so dragging "3. Lists" moves the
 * bulleted and numbered lists with it. Everything else stands alone until the
 * next heading.
 */
export function groupSections(blocks: Block[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let openLevel = 0;

  blocks.forEach((block, index) => {
    if (block.level === 0) {
      if (current) {
        current.blocks.push(block);
        return;
      }
      current = { id: LEAD_ID, level: 0, title: '', blocks: [block] };
      sections.push(current);
      return;
    }

    // A heading nested inside the open container stays with it.
    if (current && openLevel > 0 && block.level > openLevel) {
      current.blocks.push(block);
      return;
    }

    current = { id: `s-${block.id}`, level: block.level, title: block.text, blocks: [block] };
    sections.push(current);
    openLevel = isContainer(blocks, index) ? block.level : 0;
  });

  return sections;
}

/** djb2 - a short, stable key for a document's content. */
export function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const STORAGE_PREFIX = 'docs-alive-order:';
const FOLD_PREFIX = 'docs-alive-fold:';

export function storageKeyFor(html: string): string {
  return STORAGE_PREFIX + hashKey(html);
}

export function foldKeyFor(html: string): string {
  return FOLD_PREFIX + hashKey(html);
}

/**
 * Folded section ids that still exist in this document. Only sections with a
 * heading can be folded - the lead section has no heading to leave behind, so
 * folding it would hide content with nothing on screen to unfold it again.
 */
export function restoreFolds(stored: string | null, sections: Section[]): Set<string> {
  if (!stored) return new Set();

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();

    const foldable = new Set(sections.filter((s) => s.level > 0).map((s) => s.id));
    return new Set(
      parsed.filter((id): id is string => typeof id === 'string' && foldable.has(id))
    );
  } catch {
    return new Set();
  }
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