/**
 * Reads the live article DOM and serialises it.
 *
 * The DOM is the source of truth: it already reflects the current section
 * order and any table sorting, so nothing needs mirroring into React state.
 */

export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  href?: string;
  sub?: boolean;
  sup?: boolean;
};

export type Block =
  | { kind: 'heading'; level: number; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'list'; ordered: boolean; items: Run[][]; depth: number }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'image'; dataUri: string };

function readRuns(node: Node, style: Partial<Run> = {}): Run[] {
  const out: Run[] = [];

  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const text = child.nodeValue ?? '';
      if (text !== '') out.push({ ...style, text });
      return;
    }
    if (child.nodeType !== 1) return;

    const el = child as HTMLElement;
    const tag = el.tagName;

    if (tag === 'BR') {
      out.push({ ...style, text: '\n' });
      return;
    }

    const next: Partial<Run> = { ...style };
    if (tag === 'STRONG' || tag === 'B') next.bold = true;
    if (tag === 'EM' || tag === 'I') next.italic = true;
    if (tag === 'U') next.underline = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true;
    if (tag === 'SUB') next.sub = true;
    if (tag === 'SUP') next.sup = true;
    if (tag === 'A') {
      const href = el.getAttribute('href');
      if (href) next.href = href;
    }

    out.push(...readRuns(el, next));
  });

  return out;
}

const plain = (runs: Run[]) => runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim();

/** Direct list items only; nested lists are returned separately by collectLists. */
function readListItems(list: Element): Run[][] {
  return Array.from(list.children)
    .filter((li) => li.tagName === 'LI')
    .map((li) => {
      const clone = li.cloneNode(true) as Element;
      clone.querySelectorAll('ul,ol').forEach((n) => n.remove());
      return readRuns(clone);
    });
}

/** The list itself, then every nested list, each tagged with its depth. */
function collectLists(container: Element): { list: Element; depth: number }[] {
  const out: { list: Element; depth: number }[] = [];
  const visit = (el: Element, depth: number) => {
    Array.from(el.children).forEach((child) => {
      if (child.tagName === 'UL' || child.tagName === 'OL') {
        out.push({ list: child, depth });
        Array.from(child.children).forEach((li) => visit(li, depth + 1));
      } else {
        visit(child, depth);
      }
    });
  };
  visit(container, 0);
  return out;
}

export function readBlocks(root: HTMLElement): Block[] {
  const blocks: Block[] = [];

  root.querySelectorAll('.blk').forEach((el) => {
    const heading = el.querySelector(
      ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'
    );
    if (heading) {
      blocks.push({ kind: 'heading', level: Number(heading.tagName[1]) || 1, runs: readRuns(heading) });
      return;
    }

    const table = el.querySelector(':scope > table');
    if (table) {
      const rows = Array.from(table.querySelectorAll('tr'));
      const cells = (r: Element) => Array.from(r.children).map((c) => plain(readRuns(c)));
      blocks.push({
        kind: 'table',
        header: rows.length ? cells(rows[0]) : [],
        rows: rows.slice(1).map(cells),
      });
      return;
    }

    // mammoth wraps images in a paragraph, so accept both shapes.
    const img = el.querySelector(':scope > img, :scope > p > img, :scope > figure > img');
    if (img) {
      const src = img.getAttribute('src');
      if (src) blocks.push({ kind: 'image', dataUri: src });
      return;
    }

    const lists = collectLists(el);
    if (lists.length) {
      lists.forEach(({ list, depth }) =>
        blocks.push({ kind: 'list', ordered: list.tagName === 'OL', items: readListItems(list), depth })
      );
      return;
    }

    const para = el.querySelector(':scope > p');
    if (para) blocks.push({ kind: 'paragraph', runs: readRuns(para) });
  });

  return blocks;
}

/* ------------------------------- Markdown ------------------------------- */

function runToMd(run: Run): string {
  if (!run.text) return '';
  const hasMarkdownChars = /[*_`[\]]/.test(run.text);
  let text = run.text.replace(/([|*_])/g, '\\$1');
  if (run.bold) text = hasMarkdownChars ? `**${text}**` : `__${text}__`;
  if (run.italic) text = `*${text}*`;
  if (run.strike) text = `~~${text}~~`;
  if (run.href) text = `[${text}](${run.href})`;
  return text;
}

export function toMarkdown(blocks: Block[]): string {
  const out: string[] = [];

  for (const block of blocks) {
    if (block.kind === 'heading') {
      out.push(`${'#'.repeat(Math.min(block.level, 6))} ${plain(block.runs)}`);
    } else if (block.kind === 'paragraph') {
      out.push(block.runs.map(runToMd).join('').trim());
    } else if (block.kind === 'list') {
      out.push(
        block.items
          .map(
            (item, i) =>
              `${'  '.repeat(block.depth)}${block.ordered ? `${i + 1}.` : '-'} ${item.map(runToMd).join('').trim()}`
          )
          .join('\n')
      );
    } else if (block.kind === 'table') {
      const width = Math.max(block.header.length, ...block.rows.map((r) => r.length), 1);
      const pad = (cells: string[]) => {
        const copy = [...cells];
        while (copy.length < width) copy.push('');
        return `| ${copy.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`;
      };
      out.push(
        [
          pad(block.header),
          `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
          ...block.rows.map(pad),
        ].join('\n')
      );
    } else {
      out.push(`![image](${block.dataUri})`);
    }
  }

  return `${out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/* --------------------------------- HTML --------------------------------- */

/** Serialises the article as-is, so styling and table order are preserved. */
export function toHtmlDocument(root: HTMLElement, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/[<>&]/g, '')}</title>
<style>
  body{max-width:68ch;margin:0 auto;padding:48px 24px;font:16px/1.75 Georgia,serif;color:#1B2430;background:#F6F7F9}
  h1,h2,h3,h4,h5,h6{font-family:system-ui,sans-serif;line-height:1.2;margin:2em 0 .5em}
  table{width:100%;border-collapse:collapse;font:15px/1.5 system-ui,sans-serif}
  td,th{border-bottom:1px solid #D5DAE1;padding:8px;text-align:left}
  img{max-width:100%}
  a{color:#2F4BFF}
  @media print{body{background:#fff}}
</style>
</head>
<body>
${root.innerHTML}
</body>
</html>
`;
}

/* --------------------------------- DOCX --------------------------------- */

export async function toDocxBlob(blocks: Block[]): Promise<Blob> {
  const {
    Document,
    ExternalHyperlink,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
  } = await import('docx');

  const headingFor = (level: number) =>
    [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][
      Math.min(Math.max(level, 1), 6) - 1
    ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toRuns = (runs: Run[]): any[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any[] = [];
    for (const r of runs) {
      if (!r.text) continue;
      // Only real links become hyperlinks; "#anchor" targets have no
      // counterpart in a freshly generated document.
      if (r.href && /^https?:\/\//i.test(r.href)) {
        out.push(
          new ExternalHyperlink({
            children: [new TextRun({ text: r.text, color: '2F4BFF', underline: {} })],
            link: r.href,
          })
        );
        continue;
      }
      out.push(
        new TextRun({
          text: r.text,
          bold: r.bold,
          italics: r.italic,
          underline: r.underline ? {} : undefined,
          strike: r.strike,
          superScript: r.sup || undefined,
          subScript: r.sub || undefined,
        })
      );
    }
    return out;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];

  for (const block of blocks) {
    if (block.kind === 'heading') {
      children.push(new Paragraph({ heading: headingFor(block.level), children: toRuns(block.runs) }));
    } else if (block.kind === 'paragraph') {
      const runs = toRuns(block.runs);
      if (runs.length) children.push(new Paragraph({ children: runs }));
    } else if (block.kind === 'list') {
      block.items.forEach((item) => {
        const runs = toRuns(item);
        if (!runs.length) return;
        children.push(
          new Paragraph({
            children: runs,
            numbering: {
              reference: block.ordered ? 'ordered' : 'bullets',
              level: Math.min(block.depth, 2),
            },
          })
        );
      });
    } else if (block.kind === 'table') {
      const width = Math.max(block.header.length, ...block.rows.map((r) => r.length), 1);
      const cell = (text: string) =>
        new TableCell({ children: [new Paragraph({ children: [new TextRun(text)] })] });
      children.push(
        new Table({
          rows: [
            new TableRow({ children: Array.from({ length: width }, (_, i) => cell(block.header[i] ?? '')) }),
            ...block.rows.map((r) => new TableRow({ children: Array.from({ length: width }, (_, i) => cell(r[i] ?? '')) })),
          ],
        })
      );
    } else {
      try {
        const base64 = block.dataUri.split(',')[1];
        if (base64) {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          children.push(
            new Paragraph({
              children: [new ImageRun({ data: bytes, type: 'png', transformation: { width: 480, height: 270 } })],
            })
          );
        }
      } catch {
        // An unsupported image should not break the whole export.
      }
    }
  }

  const level = (format: 'bullet' | 'decimal') =>
    [0, 1, 2].map((lvl) => ({
      level: lvl,
      format: format as 'bullet' | 'decimal',
      text: format === 'decimal' ? `%${lvl + 1}.` : ['•', '◦', '▪'][lvl],
      alignment: 'start' as const,
      indent: { left: 720 * (lvl + 1), hanging: 360 },
    }));

  const doc = new Document({
    numbering: {
      config: [
        { reference: 'bullets', levels: level('bullet') },
        { reference: 'ordered', levels: level('decimal') },
      ],
    },
    sections: [{ children }],
    creator: 'Docs Alive',
  });

  return Packer.toBlob(doc);
}