/**
 * Plain-text editing of a section.
 *
 * This is a round-trip through a light markup dialect: a link is shown as
 * `text (https://example.com)`-style `[text](url)`, bold as `**bold**` and
 * italics as `*italics*`, so a section keeps its links and its emphasis while
 * it is edited. Anything else inside a block — inline formatting without a
 * marker, images — is reduced to plain words. The heading keeps its original
 * element id so the table of contents and the scroll-spy keep working.
 *
 * Data tables and images are the exception. Flattening a table into paragraphs
 * destroys its shape for good, and an image would collapse into a placeholder,
 * so both are left out of the textarea entirely and put back exactly where
 * they were. A table's cells are edited one at a time instead.
 */
import type { Block, Section } from '@/lib/sections';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A backslash escapes the next character, so prose containing `*` survives. */
const escapeMarkdown = (value: string) => value.replace(/[\\*]/g, '\\$&');

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === 3) return escapeMarkdown((node.nodeValue ?? '').replace(/\s+/g, ' '));
  if (node.nodeType !== 1) return '';

  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (tag === 'BR') return '\n';
  if (tag === 'IMG') return '';

  const inner = Array.from(el.childNodes).map(nodeToMarkdown).join('');
  if (tag === 'A') {
    const href = el.getAttribute('href');
    return href ? `[${inner.trim()}](${href})` : inner;
  }
  if (tag === 'STRONG' || tag === 'B') return inner.trim() === '' ? inner : `**${inner}**`;
  if (tag === 'EM' || tag === 'I') return inner.trim() === '' ? inner : `*${inner}*`;
  return inner;
}

/** Renders a block's inline markup as the markup the editor works in. */
function inlineToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  return root ? Array.from(root.childNodes).map(nodeToMarkdown).join('') : '';
}

/**
 * Only schemes a reader can follow are allowed through. Without this an
 * edited `[click](javascript:...)` would become a live script link.
 */
function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return /^(https?|mailto):/i.test(value) ? value : null;
  }
  return value;
}

/** Turns the editor's markup back into html. Input must already be escaped. */
function inlineFromMarkdown(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === '\\' && i + 1 < src.length) {
      out += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > -1) {
        out += `<strong>${inlineFromMarkdown(src.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (ch === '*') {
      const end = src.indexOf('*', i + 1);
      if (end > i + 1) {
        out += `<em>${inlineFromMarkdown(src.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }

    if (ch === '[') {
      const close = src.indexOf(']', i + 1);
      if (close > -1 && src[close + 1] === '(') {
        const paren = src.indexOf(')', close + 2);
        if (paren > -1) {
          const label = inlineFromMarkdown(src.slice(i + 1, close));
          // The href is still in its escaped form, which is both what belongs
          // in an attribute and what stops a quote in the URL from ending it.
          const href = safeHref(src.slice(close + 2, paren));
          out += href === null ? label : `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
          i = paren + 1;
          continue;
        }
      }
    }

    out += ch;
    i++;
  }
  return out;
}

/** The text a reader sees, with the markup markers taken back out. */
const stripInline = (value: string) =>
  value
    .replace(/\\([\\*])/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\s][^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1');

function innerHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return doc.body.firstElementChild?.innerHTML ?? '';
}

/**
 * Flattens a list to indented lines. A regex over `<li>` cannot do this: it
 * stops at the *nested* item's closing tag, which glues a nested list onto its
 * parent as "Upload a documentParse the structure".
 */
function listToText(html: string, ordered: boolean): string {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild;
  // The block's own element is the list; the wrapper div above it holds the items.
  const list = root?.matches('ul,ol') ? root : root?.querySelector('ul,ol');
  if (!list) return '';

  const lines: string[] = [];
  const walk = (parent: Element, depth: number) => {
    let n = 0;
    for (const li of Array.from(parent.children).filter((c) => c.tagName === 'LI')) {
      n += 1;
      const clone = li.cloneNode(true) as Element;
      for (const nested of Array.from(clone.querySelectorAll('ul,ol'))) nested.remove();
      const text = inlineToMarkdown(clone.innerHTML).replace(/\s+/g, ' ').trim();
      lines.push(`${'  '.repeat(depth)}${ordered ? `${n}.` : '-'} ${text}`.trimEnd());
      for (const nested of Array.from(li.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL')) {
        walk(nested, depth + 1);
      }
    }
  };
  walk(list, 0);
  return lines.join('\n');
}

function blockToText(block: Block): string {
  const { html } = block;
  if (/^\s*<table/i.test(html)) {
    return Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
      .map((m) =>
        Array.from(m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
          .map((c) => stripTags(c[1]))
          .join(' | ')
      )
      .join('\n');
  }
  const list = /^\s*<(ul|ol)[\s>]/i.exec(html);
  if (list) return listToText(html, list[1].toLowerCase() === 'ol');
  return inlineToMarkdown(innerHtml(html)).replace(/\n+$/, '');
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sectionToText(section: Section): string {
  return section.blocks
    .filter((b) => !b.preserved)
    .map(blockToText)
    .filter((t) => t !== '')
    .join('\n\n');
}

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const splitChunks = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c !== '');

/**
 * Matches each edited paragraph to the block it came from, so a reworded block
 * keeps its position, its level and — for a heading — its id. Longest common
 * subsequence, because a single reworded paragraph must not shift every block
 * after it. The sections involved hold a handful of blocks, so the quadratic
 * table is free.
 */
function alignToBlocks(original: Block[], chunks: string[]): Map<number, number> {
  const m = original.length;
  const n = chunks.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        normalise(original[i].text) === normalise(chunks[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matches = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (normalise(original[i].text) === normalise(chunks[j])) {
      matches.set(j, i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

type ListItem = { depth: number; ordered: boolean; text: string };

const LIST_LINE = /^(\s*)(-\s+|\d+\.\s+)(.*)$/;

/** Rebuilds nested lists from indented lines, nesting by two spaces a level. */
function buildList(items: ListItem[], start: number, depth: number): { html: string; next: number } {
  const tag = items[start].ordered ? 'ol' : 'ul';
  let html = `<${tag}>`;
  let i = start;
  while (i < items.length && items[i].depth >= depth) {
    if (items[i].depth > depth) {
      const nested = buildList(items, i, items[i].depth);
      html = html.replace(/<\/li>$/, `${nested.html}</li>`);
      i = nested.next;
      continue;
    }
    html += `<li>${inlineFromMarkdown(escapeHtml(items[i].text))}</li>`;
    i++;
  }
  return { html: `${html}</${tag}>`, next: i };
}

function toBlock(section: Section, chunk: string, original: Block | undefined, index: number): Block {
  const text = stripInline(chunk);
  const rendered = (value: string) => inlineFromMarkdown(escapeHtml(value));
  const id = original?.id ?? `${section.id}-edit-${index}`;

  if (original && original.level > 0) {
    const headingId = original.headingIds[0] ?? '';
    return {
      id: original.id,
      html: `<h${original.level} id="${headingId}">${rendered(chunk)}</h${original.level}>`,
      level: original.level,
      text,
      headingIds: headingId ? [headingId] : [],
    };
  }

  // Lines indented by two spaces a level rebuild the nesting the reader saw.
  const lines = chunk.split('\n').filter((l) => l.trim() !== '');
  const parsed = lines.map((l) => LIST_LINE.exec(l));
  if (lines.length > 0 && parsed.every((m) => m !== null)) {
    const items: ListItem[] = (parsed as RegExpExecArray[]).map((m) => ({
      depth: Math.min(Math.floor(m[1].length / 2), 6),
      ordered: /^\d/.test(m[2]),
      text: m[3],
    }));
    return { id, html: buildList(items, 0, items[0].depth).html, level: 0, text, headingIds: [] };
  }

  return {
    id,
    html: `<p>${lines.map((l) => rendered(l.trim())).join('<br>')}</p>`,
    level: 0,
    text,
    headingIds: [],
  };
}

/**
 * Rebuilds a section's blocks from edited plain text. Preserved blocks — data
 * tables and images — are carried over untouched and re-inserted after the
 * block they originally followed.
 */
export function textToBlocks(section: Section, text: string): Block[] {
  const chunks = splitChunks(text);

  // Emptying a section would take its heading — and with it the outline entries
  // and the scroll-spy anchors below it — so a blank field means "leave it be".
  if (chunks.length === 0) return section.blocks;

  const editable: Block[] = [];
  const preservedAfter = new Map<number, Block[]>();

  for (const block of section.blocks) {
    if (block.preserved) {
      const anchor = editable.length - 1;
      const list = preservedAfter.get(anchor) ?? [];
      list.push(block);
      preservedAfter.set(anchor, list);
      continue;
    }
    editable.push(block);
  }

  // Alignment compares what the reader sees, not the markup around it, so a
// paragraph still matches its block after the reader edits the link or the
// bold in it.
const matches = alignToBlocks(editable, chunks.map(stripInline));

  // A section always opens with its heading, and its id is what the outline and
  // the scroll-spy navigate by, so the first paragraph is that heading even when
  // the reader has reworded it and the text no longer matches.
  if (editable.length > 0 && editable[0].level > 0) {
    matches.set(0, 0);
    for (const [chunkIndex, blockIndex] of [...matches]) {
      if (blockIndex === 0 && chunkIndex !== 0) matches.delete(chunkIndex);
    }
  }

  const groups = new Map<number, Block[]>();
  let lastSlot = -1;
  chunks.forEach((chunk, ci) => {
    const matched = matches.get(ci);
    if (matched !== undefined) lastSlot = matched;
    // A paragraph the reader added joins the block it was typed next to.
    const key = matched ?? lastSlot;
    const list = groups.get(key) ?? [];
    list.push(toBlock(section, chunk, matched !== undefined ? editable[matched] : undefined, list.length));
    groups.set(key, list);
  });

  const out: Block[] = [];
  for (const block of preservedAfter.get(-1) ?? []) out.push(block);
  for (const block of groups.get(-1) ?? []) out.push(block);
  for (let i = 0; i < editable.length; i++) {
    for (const block of groups.get(i) ?? []) out.push(block);
    for (const block of preservedAfter.get(i) ?? []) out.push(block);
  }
  return out;
}