/**
 * Plain-text editing of a section.
 *
 * This is a round-trip through a light markup dialect: a link is shown as
 * `[text](url)`, bold as `**bold**`, italics as `*italics*`, strikethrough as
 * `~~struck~~`, inline code as `` `code` ``, subscript as `H~2~O` and
 * superscript as `x^2^`. That keeps the inline formatting mammoth emits while
 * the section is edited. Anything without a marker is reduced to plain words,
 * but only in a block the reader actually changed: a block whose text comes
 * back untouched keeps its original markup (see textToBlocks). The heading
 * keeps its original element id so the table of contents and the scroll-spy
 * keep working.
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
const escapeMarkdown = (value: string) => value.replace(/[\\*~^`]/g, '\\$&');

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === 3) return escapeMarkdown((node.nodeValue ?? '').replace(/\s+/g, ' '));
  if (node.nodeType !== 1) return '';

  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (tag === 'BR') return '\n';
  if (tag === 'IMG') return '';

  const inner = Array.from(el.childNodes).map(nodeToMarkdown).join('');
  const wrap = (marker: string) => (inner.trim() === '' ? inner : `${marker}${inner}${marker}`);
  if (tag === 'A') {
    const href = el.getAttribute('href');
    return href ? `[${inner.trim()}](${href})` : inner;
  }
  if (tag === 'STRONG' || tag === 'B') return wrap('**');
  if (tag === 'EM' || tag === 'I') return wrap('*');
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') return wrap('~~');
  if (tag === 'SUB') return wrap('~');
  if (tag === 'SUP') return wrap('^');
  if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') return wrap('`');
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

    if (ch === '~' && src[i + 1] === '~') {
      const end = src.indexOf('~~', i + 2);
      if (end > -1) {
        out += `<s>${inlineFromMarkdown(src.slice(i + 2, end))}</s>`;
        i = end + 2;
        continue;
      }
    }

    if (ch === '~') {
      const end = src.indexOf('~', i + 1);
      if (end > i + 1) {
        out += `<sub>${inlineFromMarkdown(src.slice(i + 1, end))}</sub>`;
        i = end + 1;
        continue;
      }
    }

    if (ch === '^') {
      const end = src.indexOf('^', i + 1);
      if (end > i + 1) {
        out += `<sup>${inlineFromMarkdown(src.slice(i + 1, end))}</sup>`;
        i = end + 1;
        continue;
      }
    }

    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > -1) {
        out += `<code>${src.slice(i + 1, end).replace(/\\([\s\S])/g, '$1')}</code>`;
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
    .replace(/\\([\\*~^`])/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\s][^*]*)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/~([^~\s][^~]*)~/g, '$1')
    .replace(/\^([^\^\s][^\^]*)\^/g, '$1')
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

/**
 * The comparable form of a paragraph: what the reader sees, with inline markers
 * and list bullets removed. Alignment must not depend on the markup, or
 * changing a word's bold would look like a different paragraph. Lists need
 * their bullets and indentation removed too, since a block's text does not
 * carry them.
 */
const alignKey = (value: string) =>
  stripInline(value)
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Exact editor text, used to decide whether a block was touched at all. */
const editorKey = (value: string) => value.replace(/\r\n?/g, '\n').trim();

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
function alignToBlocks(originalKeys: string[], chunkKeys: string[]): Map<number, number> {
  const m = originalKeys.length;
  const n = chunkKeys.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        originalKeys[i] === chunkKeys[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matches = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (originalKeys[i] === chunkKeys[j]) {
      matches.set(j, i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  // The LCS only pairs paragraphs whose text is unchanged, so a reworded
  // paragraph would look like a brand-new block — losing its id, and turning a
  // reworded subheading into a plain paragraph. When a gap between two anchors
  // holds the same number of paragraphs on both sides, the reader reworded them
  // rather than adding or removing one, so pair them by position.
  const anchors = [...matches.entries()].sort((a, b) => a[0] - b[0]);
  anchors.push([n, m]);
  let prevChunk = -1;
  let prevBlock = -1;
  for (const [chunk, block] of anchors) {
    const chunkGap = chunk - prevChunk - 1;
    const blockGap = block - prevBlock - 1;
    if (chunkGap > 0 && chunkGap === blockGap) {
      for (let k = 0; k < chunkGap; k++) {
        matches.set(prevChunk + 1 + k, prevBlock + 1 + k);
      }
    }
    prevChunk = chunk;
    prevBlock = block;
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

/** A fresh id that cannot collide with one already in the section. */
function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function toBlock(chunk: string, original: Block | undefined, id: string): Block {
  const text = stripInline(chunk);
  const rendered = (value: string) => inlineFromMarkdown(escapeHtml(value));

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
 *
 * A block whose text comes back exactly as it went in is kept as-is rather than
 * rebuilt from the textarea. The dialect only carries the inline formatting
 * that has a marker, so rebuilding an untouched paragraph would quietly strip
 * everything else it had — a quote, a code span, a class mammoth emitted. Only
 * the paragraph the reader actually changed is rebuilt.
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

  const originalText = editable.map(blockToText);
  // Alignment compares what the reader sees, not the markup around it, so a
  // paragraph still matches its block after the reader edits the link or the
  // bold in it.
  const matches = alignToBlocks(originalText.map(alignKey), chunks.map(alignKey));

  // A section always opens with its heading, and its id is what the outline and
  // the scroll-spy navigate by, so the first paragraph is that heading even when
  // the reader has reworded it and the text no longer matches.
  if (editable.length > 0 && editable[0].level > 0) {
    matches.set(0, 0);
    for (const [chunkIndex, blockIndex] of [...matches]) {
      if (blockIndex === 0 && chunkIndex !== 0) matches.delete(chunkIndex);
    }
  }

  const used = new Set(section.blocks.map((b) => b.id));
  const groups = new Map<number, Block[]>();
  let lastSlot = -1;
  chunks.forEach((chunk, ci) => {
    const matched = matches.get(ci);
    if (matched !== undefined) lastSlot = matched;
    // A paragraph the reader added joins the block it was typed next to.
    const key = matched ?? lastSlot;
    const original = matched !== undefined ? editable[matched] : undefined;

    let block: Block;
    if (original !== undefined && matched !== undefined && editorKey(chunk) === editorKey(originalText[matched])) {
      block = original;
    } else {
      // A reworded block keeps its id, so it stays the same block as far as the
      // rest of the view is concerned; only a genuinely new block gets a new one.
      block = toBlock(chunk, original, original?.id ?? uniqueId(`${section.id}-edit-${ci}`, used));
    }

    const list = groups.get(key) ?? [];
    list.push(block);
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