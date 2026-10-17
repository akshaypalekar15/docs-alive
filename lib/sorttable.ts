/**
 * Client-side table sorting.
 *
 * Two things make this harder than it looks, and both show up in real .docx:
 *
 *  1. Most tables have no plain <th> cells, and the header may use colspan and
 *     rowspan. A header cell's position in the header row is therefore NOT its
 *     data column: "<th rowspan=2>A</th><th colspan=2>B</th><th rowspan=2>C</th>"
 *     puts C in data column 3, not 2. Column starts are computed by
 *     accumulating colspans.
 *
 *  2. Tables often have a second header row (a sub-header such as "Q2 | Q3").
 *     It lives in <tbody>, so it would be sorted around with the data unless it
 *     is detected and pinned.
 *
 * Rows are reordered by moving the <tr> nodes directly: React rendered the table
 * through dangerouslySetInnerHTML and does not own the rows, and it skips
 * re-setting innerHTML while the HTML string is unchanged.
 */

const HEAD_CLASS = 'sortable-head';
const FIXED_ATTR = 'data-sort-fixed';
/** A run of all-bold rows directly under the header is a sub-header. */
const MAX_SUBHEADER_ROWS = 2;

function cellText(row: Element, index: number): string {
  return (row.children[index]?.textContent ?? '').trim();
}

function toNumber(value: string): number {
  const cleaned = value
    .replace(/[₹$€£¥]/g, '')
    .replace(/,/g, '')
    .replace(/[%\s]/g, '')
    .replace(/[–—]/g, '-');
  if (cleaned === '' || cleaned === '-') return NaN;
  const negative = /^\(.*\)$/.test(cleaned);
  const n = Number(negative ? cleaned.slice(1, -1) : cleaned);
  return negative ? -n : n;
}

/** True when every visible character of the cell is inside <strong>/<b>. */
function isBoldCell(cell: Element): boolean {
  const text = (cell.textContent ?? '').trim();
  if (text === '') return false;
  const wrapper = cell.querySelector('strong, b');
  if (!wrapper) return false;
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll('strong, b').forEach((n) => n.remove());
  return (clone.textContent ?? '').trim() === '';
}

function isNumericColumn(rows: Element[], index: number): boolean {
  const values = rows.map((r) => cellText(r, index)).filter((v) => v !== '');
  if (values.length === 0) return false;
  return values.every((v) => Number.isFinite(toNumber(v)));
}

function compareNumeric(a: string, b: string): number {
  const na = toNumber(a);
  const nb = toNumber(b);
  const aBad = Number.isNaN(na);
  const bBad = Number.isNaN(nb);
  // Text that is not a number always sinks to the bottom, both directions.
  if (aBad && bBad) return 0;
  if (aBad) return 1;
  if (bBad) return -1;
  return na - nb;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function contentCells(row: Element): HTMLElement[] {
  return Array.from(row.children).filter(
    (c): c is HTMLElement => c.tagName === 'TD' || c.tagName === 'TH'
  );
}

/**
 * Maps each header cell to the data column it starts at, accumulating colspan
 * so the index lines up with the cells of ordinary data rows.
 */
function headerColumnStarts(cells: HTMLElement[]): number[] {
  const starts: number[] = [];
  let column = 0;
  for (const cell of cells) {
    starts.push(column);
    const span = Number.parseInt(cell.getAttribute('colspan') ?? '1', 10);
    column += Number.isFinite(span) && span > 0 ? span : 1;
  }
  return starts;
}

export function prepareSortableTables(root: HTMLElement): HTMLTableElement[] {
  const prepared: HTMLTableElement[] = [];

  const tables = Array.from(root.querySelectorAll('table.sortable-table')) as HTMLTableElement[];

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) continue;

    const headRow = rows[0];
    const headCells = contentCells(headRow);
    if (headCells.length < 2) continue;

    // Pin sub-header rows (e.g. "Q2 | Q3") so they are never sorted as data.
    const body = table.tBodies[0];
    if (body) {
      let pinned = 0;
      const subRows = Array.from(body.querySelectorAll(':scope > tr')) as HTMLTableRowElement[];
      for (const row of subRows) {
        if (pinned >= MAX_SUBHEADER_ROWS) break;
        const cells = contentCells(row);
        if (cells.length === 0) break;
        const allBold = cells.every(isBoldCell);
        const allNumeric = cells.every((c) => Number.isFinite(toNumber((c.textContent ?? '').trim())));
        if (!allBold || allNumeric) break;
        row.setAttribute(FIXED_ATTR, '1');
        pinned++;
      }
    }

    const starts = headerColumnStarts(headCells);
    headCells.forEach((cell, index) => {
      cell.classList.add(HEAD_CLASS);
      cell.setAttribute('role', 'columnheader');
      cell.setAttribute('tabindex', '0');
      cell.dataset.sortCol = String(starts[index]);
    });
    headRow.classList.add('sortable-headrow');
    prepared.push(table);
  }

  return prepared;
}

export function sortTable(table: HTMLTableElement, column: number): void {
  const body = table.tBodies[0];
  if (!body) return;

  const all = Array.from(body.querySelectorAll(':scope > tr'));
  const rows = all.filter((r) => !r.hasAttribute(FIXED_ATTR));
  if (rows.length < 2) return;

  const directionKey = `data-sort-${column}`;
  const direction: 'ascending' | 'descending' =
    table.getAttribute(directionKey) === 'ascending' ? 'descending' : 'ascending';

  for (const other of Array.from(table.querySelectorAll('[aria-sort]'))) {
    other.removeAttribute('aria-sort');
  }
  table.querySelector(`[data-sort-col="${column}"]`)?.setAttribute('aria-sort', direction);

  const numeric = isNumericColumn(rows, column);
  const indexed = rows.map((row, index) => ({ row, index, key: cellText(row, column) }));

  indexed.sort((a, b) => {
    const result = numeric ? compareNumeric(a.key, b.key) : compareText(a.key, b.key);
    if (result !== 0) return direction === 'ascending' ? result : -result;
    // Stable: equal values keep their original relative order.
    return a.index - b.index;
  });

  // Appending only the data rows leaves any pinned sub-header rows on top.
  for (const { row } of indexed) body.appendChild(row);
  table.setAttribute(directionKey, direction);
  table.dataset.sortColumn = String(column);
}