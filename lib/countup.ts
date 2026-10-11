/**
 * Finds "stat-like" numbers in rendered document HTML and wraps the digits in
 * spans so they can be counted up when scrolled into view.
 *
 * Anything that is not really a statistic is skipped: years, date ranges,
 * versions, phone numbers, URLs, and everything inside headings or code.
 */

const SKIP_SELECTOR =
  'pre, code, kbd, samp, h1, h2, h3, h4, h5, h6, time, sup, sub, .countup, .no-count';

/** Thousands-grouped numbers, or plain numbers with optional decimals. */
const PATTERN = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/g;

/** Means the digits belong to a range or version: 2012 - 2016, 16.4.0 */
const RANGE_CHARS = '-–—/×.';

const MONTHS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

/** Words that make the following number a reference, not a statistic. */
const LABEL_WORDS = new Set([
  'figure', 'fig', 'table', 'section', 'chapter', 'step', 'item', 'no', 'nos',
  'appendix', 'part', 'page', 'ex', 'example', 'see', 'above', 'below',
]);

/** The word immediately after (or immediately before) a match. */
function adjacentWord(text: string, index: number, dir: 'before' | 'after'): string {
  const m =
    dir === 'after'
      ? /^\s*([A-Za-z]+)/.exec(text.slice(index))
      : /([A-Za-z]+)\s*$/.exec(text.slice(0, index));
  return m ? m[1].toLowerCase() : '';
}

function isStat(text: string, raw: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';

  // Range, version or decimal continuation. Guard against the empty string:
  // 'abc'.includes('') is true, which would skip every number sitting at the
  // very start or end of a text node (e.g. inside <strong>12.4%</strong>).
  if ((before && RANGE_CHARS.includes(before)) || (after && RANGE_CHARS.includes(after))) return false;

  // Glued to a word: S3, ES6, 6px, React19. A real stat has whitespace around it.
  if (/[A-Za-z]/.test(before) || /[A-Za-z]/.test(after)) return false;

  const numeric = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return false;

  // A bare four-digit number in year range is a year, not a statistic.
  if (!raw.includes(',') && !raw.includes('.') && raw.length === 4) {
    if (numeric >= 1900 && numeric <= 2099) return false;
  }

  // Day numbers: "11 October 2026", "October 11, 2026".
  if (MONTHS.has(adjacentWord(text, end, 'after'))) return false;
  if (MONTHS.has(adjacentWord(text, start, 'before'))) return false;

  // Cross-references: "content[1]", "Figure 1:", "Section 5".
  if (before === '[' || after === ']') return false;
  if (LABEL_WORDS.has(adjacentWord(text, start, 'before'))) return false;

  return true;
}

export function scanForNumbers(root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];

  // Collect first, mutate second. Replacing a node mid-walk detaches the
  // walker's current node and silently ends the traversal.
  const candidates: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;

  while (node) {
    const parent = node.parentElement;
    const text = node.nodeValue ?? '';
    if (parent && /\d/.test(text) && !parent.closest(SKIP_SELECTOR)) {
      // Leave contact details and URLs alone. In-page anchors still count.
      const link = parent.closest('a[href]');
      const external = link !== null && !link.getAttribute('href')?.startsWith('#');
      if (!/@|www\.|https?:/i.test(text) && !external) candidates.push(node);
    }
    node = walker.nextNode() as Text | null;
  }

  for (const textNode of candidates) {
    const text = textNode.nodeValue ?? '';
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let changed = false;

    PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PATTERN.exec(text)) !== null) {
      const raw = match[1];
      const start = match.index;
      const end = start + raw.length;
      if (!isStat(text, raw, start, end)) continue;

      changed = true;
      fragment.appendChild(document.createTextNode(text.slice(cursor, start)));

      const span = document.createElement('span');
      span.className = 'countup';
      span.textContent = raw;
      span.dataset.count = String(Number(raw.replace(/,/g, '')));
      span.dataset.decimals = raw.includes('.') ? String(raw.split('.')[1].length) : '0';
      fragment.appendChild(span);
      found.push(span);

      cursor = end;
    }

    if (changed) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }

  return found;
}

export function formatCount(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}