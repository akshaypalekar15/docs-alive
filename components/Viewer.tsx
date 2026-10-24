'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  Reorder,
  motion,
  motionValue,
  useDragControls,
  useScroll,
  useSpring,
  type MotionValue,
} from 'framer-motion';
import DOMPurify from 'dompurify';
import Background from '@/components/Background';
import ExportMenu from '@/components/ExportMenu';
import LinkPreview from '@/components/LinkPreview';
import SectionEditor from '@/components/SectionEditor';
import TableSort from '@/components/TableSort';
import ThemeToggle from '@/components/ThemeToggle';
import TocNav from '@/components/TocNav';
import { type Heading } from '@/lib/toc';
import {
  foldKeyFor,
  groupSections,
  restoreFolds,
  restoreOrder,
  storageKeyFor,
  type Block,
  type Section,
} from '@/lib/sections';
import { sectionToText, textToBlocks } from '@/lib/sectionText';
import { prepareSortableTables } from '@/lib/sorttable';
import { useDragSelectionGuard } from '@/lib/useDragSelectionGuard';

type Metric = { id: string; top: number; end: number };

/** Identity of a cell, as a child-index path from the block that contains it. */
function cellPath(td: Element, root: Element): number[] {
  const path: number[] = [];
  let node: Element | null = td;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return node === root ? path : [];
}

const cellKey = (blockId: string, path: number[]) => `${blockId}|${path.join('.')}`;

/**
 * The cell under a double-click, if it is one the reader is allowed to change.
 * Header cells are excluded: they are sortable, and a rewritten header would
 * silently break the column alignment the sort depends on.
 */
function editableCell(target: HTMLElement): {
  td: HTMLTableCellElement;
  blockId: string;
  path: number[];
  text: string;
} | null {
  const td = target.closest('td');
  if (!td || !td.closest('table')) return null;
  if (td.closest('thead, .sortable-head, .sortable-headrow, .sec-handle')) return null;
  const root = target.closest<HTMLElement>('[data-block-id]');
  const blockId = root?.dataset.blockId;
  if (!root || !blockId) return null;
  const path = cellPath(td, root);
  if (path.length === 0) return null;
  return { td, blockId, path, text: (td.textContent ?? '').trim() };
}

/**
 * A draggable section. Dragging is started from the handle rather than the body
 * so that selecting and copying text inside a section still works.
 *
 * Folding keeps the leading heading on screen and hides only the blocks after
 * it, so a folded section still reads as itself in the document. Nothing is
 * unmounted while folded: the exporter reads the live article, so a section
 * removed from the DOM would silently vanish from every export.
 */
function DraggableSection({
  id,
  title,
  editing,
  folded,
  hidden,
  canFold,
  onToggleFold,
  onRequestEdit,
  children,
  rest,
}: {
  id: string;
  title: string;
  editing: boolean;
  folded: boolean;
  hidden: boolean;
  canFold: boolean;
  onToggleFold: () => void;
  onRequestEdit: (target: HTMLElement) => void;
  children: React.ReactNode;
  rest: React.ReactNode;
}) {
  const controls = useDragControls();
  const dragGuard = useDragSelectionGuard();

  const startEdit = (e: React.MouseEvent) => {
    // Only a plain double-click on the section itself, never on a control.
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, .sortable-head, .sec-handle, img')) return;
    onRequestEdit(target);
  };

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className="sec"
      data-editing={editing}
      data-collapsed={folded ? 'true' : undefined}
      data-hidden={hidden ? 'true' : undefined}
      onDoubleClick={startEdit}
    >
      {/* Decorative: keyboard reordering is not implemented, the reset
          control in the sidebar is the accessible way to undo a change. */}
      {!editing && (
        <span
          className="sec-handle"
          aria-hidden="true"
          onPointerDown={(e) => {
            dragGuard.onDragHandlePointerDown();
            controls.start(e);
          }}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="2.5" cy="2" r="1.4" /><circle cx="7.5" cy="2" r="1.4" />
            <circle cx="2.5" cy="7" r="1.4" /><circle cx="7.5" cy="7" r="1.4" />
            <circle cx="2.5" cy="12" r="1.4" /><circle cx="7.5" cy="12" r="1.4" />
          </svg>
        </span>
      )}
      {!editing && canFold && (
        <button
          className="sec-toggle"
          aria-expanded={!folded}
          aria-label={folded ? `Expand ${title}` : `Collapse ${title}`}
          title={folded ? 'Expand section' : 'Collapse section'}
          onClick={onToggleFold}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      <div className="sec-body">
        {children}
        {rest}
      </div>
    </Reorder.Item>
  );
}

/**
 * A table whose own body is a single row with a single cell is a layout
 * wrapper, not data — mammoth emits these for resume headers and for wrapping
 * a nested table. Uses table.rows rather than querySelectorAll('tr'), which is
 * recursive and would count rows belonging to a table nested inside.
 */
function isLayoutTable(el: Element): boolean {
  if (el.tagName !== 'TABLE') return false;
  const table = el as HTMLTableElement;
  if (table.rows.length !== 1) return false;
  return table.rows[0].cells.length <= 1;
}

/** Distance from the top of the viewport that counts as "the current heading". */
const LINE = 140;
const SCROLL_OFFSET = 24;

/** A paragraph whose entire content is bold, e.g. a styled section title. */
function isBoldOnly(el: Element): boolean {
  // childNodes, not children: text nodes don't count as children, so
  // "text <strong>bold</strong> text" would otherwise look like bold-only.
  const nodes = Array.from(el.childNodes).filter(
    (n) => n.nodeType !== 3 || (n.textContent ?? '').trim() !== ''
  );
  if (nodes.length !== 1 || nodes[0].nodeType !== 1) return false;
  if (!/^(STRONG|B)$/.test((nodes[0] as Element).tagName)) return false;
  const text = (el.textContent ?? '').trim();
  return text.length > 0 && text.length <= 120;
}

/**
 * Walks the document in order and collects headings. Mammoth only emits
 * <h1>-<h3> for paragraphs using Word's built-in Heading styles, so documents
 * that fake headings with bold text would otherwise produce an empty TOC —
 * hence the bold-paragraph fallback.
 */
function collectHeadings(doc: Document, boldFallback: boolean): Heading[] {
  const out: Heading[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let el = walker.nextNode() as HTMLElement | null;
  let n = 0;

  while (el) {
    const real = /^H[1-3]$/.test(el.tagName);
    if (real || (boldFallback && el.tagName === 'P' && isBoldOnly(el))) {
      const text = (el.textContent ?? '').trim();
      if (text) {
        const id = `h-${n++}`;
        el.id = id;
        out.push({ id, level: real ? Number(el.tagName[1]) : 2, text });
      }
    }
    el = walker.nextNode() as HTMLElement | null;
  }

  return out;
}

export default function Viewer({ html, name, onReset }: { html: string; name: string; onReset: () => void }) {
  const [active, setActive] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const docRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  // Headings are collected with querySelectorAll rather than by walking
  // body.children, so headings nested inside other elements still get an id.
  const { blocks, headings } = useMemo(() => {
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html), 'text/html');

    const dataTables = new Set<Element>();
    for (const t of Array.from(doc.querySelectorAll('table'))) {
      if (isLayoutTable(t)) continue;
      t.classList.add('neon-table', 'sortable-table');
      dataTables.add(t);
    }

    const hs = collectHeadings(doc, false);
    const found = hs.length < 2 ? collectHeadings(doc, true) : hs;

    // Blocks are tagged with the level of the heading they contain, including
    // bold-paragraph pseudo-headings, which are <p> and would otherwise never
    // form a section boundary. collectHeadings has already put an id on each.
    const levelById = new Map(found.map((h) => [h.id, h.level]));
    const bs: Block[] = Array.from(doc.body.children).map((el, i) => ({
      id: `b-${i}`,
      html: el.outerHTML,
      level: levelById.get(el.id) ?? 0,
      text: (el.textContent ?? '').trim(),
      preserved: dataTables.has(el) || /<img[\s>]/i.test(el.outerHTML),
      // Includes headings nested inside the block, such as a heading inside a
      // table cell, so no heading is ever lost from the outline.
      headingIds: [el, ...Array.from(el.querySelectorAll('[id]'))]
        .map((n) => n.id)
        .filter((id) => levelById.has(id)),
    }));
    return { blocks: bs, headings: found };
  }, [html]);

  const sections = useMemo(() => groupSections(blocks), [blocks]);
  const naturalOrder = useMemo(() => sections.map((s) => s.id), [sections]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);

  const [order, setOrder] = useState<string[]>(() =>
    restoreOrder(
      typeof window === 'undefined' ? null : window.localStorage.getItem(storageKeyFor(html)),
      sections
    )
  );
  const isReordered = order.some((id, i) => id !== naturalOrder[i]);

  // Which sections the reader has folded away, remembered per document. The
  // content itself is hidden with CSS rather than removed: see DraggableSection.
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    restoreFolds(
      typeof window === 'undefined' ? null : window.localStorage.getItem(foldKeyFor(html)),
      sections
    )
  );

  // Focus mode is a way of reading, not a property of the document, so unlike
  // the order and the folds it is deliberately not persisted.
  const [focus, setFocus] = useState<string | null>(null);

  // A table sort changes the document too, and it is applied straight to the
  // DOM, so the count is lifted into state purely to flag the export CTA.
  const [sortedTables, setSortedTables] = useState(0);
  const onTableSorted = useCallback(() => setSortedTables((n) => n + 1), []);

  // Section edits are session-only: uploading the file again starts fresh.
  const [edits, setEdits] = useState<Map<string, Block[]>>(() => new Map());
  const [editingSection, setEditingSection] = useState<{ id: string; text: string } | null>(null);

  const beginEdit = useCallback((section: Section, blocks: Block[]) => {
    setEditingSection({ id: section.id, text: sectionToText({ ...section, blocks }) });
  }, []);

  // A cell edit is applied to the block's HTML rather than to the DOM directly,
  // so the cell keeps its spans, widths and nested content and React stays the
  // single owner of that markup.
  const [cellEdits, setCellEdits] = useState<Map<string, string>>(() => new Map());
  const [editingCell, setEditingCell] = useState<{ blockId: string; path: number[]; text: string } | null>(null);
  const [cellBox, setCellBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const cellTarget = useRef<HTMLTableCellElement | null>(null);

  const measureCell = useCallback(() => {
    const td = cellTarget.current;
    if (!td) return;
    const r = td.getBoundingClientRect();
    setCellBox({ left: r.left, top: r.top, width: r.width, height: r.height });
  }, []);

  useEffect(() => {
    if (!editingCell) return;
    measureCell();
    window.addEventListener('scroll', measureCell, true);
    window.addEventListener('resize', measureCell);
    return () => {
      window.removeEventListener('scroll', measureCell, true);
      window.removeEventListener('resize', measureCell);
    };
  }, [editingCell, measureCell]);

  const closeCellEditor = useCallback(() => {
    cellTarget.current = null;
    setEditingCell(null);
    setCellBox(null);
  }, []);

  // Re-rendering a block to apply an edit replaces that block's markup, which
  // drops the attributes the sorter attached to its header cells. Re-preparing
  // is idempotent, so the table simply becomes sortable again.
  useEffect(() => {
    if (cellEdits.size === 0 && edits.size === 0) return;
    const el = docRef.current;
    if (el) prepareSortableTables(el);
  }, [cellEdits, edits]);

  const renderBlockHtml = useCallback(
    (block: Block): string => {
      const prefix = `${block.id}|`;
      const entries = [...cellEdits].filter(([key]) => key.startsWith(prefix));
      if (entries.length === 0) return block.html;
      const doc = new DOMParser().parseFromString(`<div>${block.html}</div>`, 'text/html');
      const root = doc.body.firstElementChild;
      if (!root) return block.html;
      for (const [key, text] of entries) {
        let node: Element | null = root;
        for (const step of key.slice(prefix.length).split('.')) node = node?.children[Number(step)] ?? null;
        if (node) node.textContent = text;
      }
      return root.innerHTML;
    },
    [cellEdits]
  );

  const isAltered = isReordered || sortedTables > 0 || edits.size > 0 || cellEdits.size > 0;

  // Save the arrangement and the folds so reopening the same file restores them.
  useEffect(() => {
    window.localStorage.setItem(storageKeyFor(html), JSON.stringify(order));
  }, [html, order]);

  useEffect(() => {
    window.localStorage.setItem(foldKeyFor(html), JSON.stringify([...collapsed]));
  }, [html, collapsed]);

  const resetOrder = useCallback(() => {
    setOrder(naturalOrder);
  }, [naturalOrder]);

  const orderedSections = useMemo(
    () => order.map((id) => sectionById.get(id)).filter((s): s is Section => s !== undefined),
    [order, sectionById]
  );

  // Only sections that carry a heading can be read one at a time; the lead
  // section is the content before the first heading and has no title to show.
  const focusable = useMemo(() => orderedSections.filter((s) => s.level > 0), [orderedSections]);
  const focusIndex = focus ? focusable.findIndex((s) => s.id === focus) : -1;

  const folded = useMemo(
    () =>
      focus
        ? new Set(orderedSections.map((s) => s.id).filter((id) => id !== focus))
        : collapsed,
    [focus, orderedSections, collapsed]
  );

  const headingById = useMemo(() => new Map(headings.map((h) => [h.id, h])), [headings]);

  // The outline follows the reader's arrangement, not the parse order, so the
  // contents and the document can never disagree.
  const outline = useMemo(() => {
    const out: (Heading & { sectionId: string })[] = [];
    for (const section of orderedSections) {
      const blocks = edits.get(section.id) ?? section.blocks;
      for (const block of blocks) {
        for (const id of block.headingIds) {
          const heading = headingById.get(id);
          if (!heading) continue;
          // Prefer the block's own text so an edited heading shows in the outline.
          const text = block.headingIds.length === 1 ? block.text : heading.text;
          out.push({ ...heading, text, sectionId: section.id });
        }
      }
    }
    return out;
  }, [orderedSections, headingById, edits]);

  // Headings grouped by the section they belong to, for the draggable outline.
  const rowsBySection = useMemo(() => {
    const map = new Map<string, (Heading & { sectionId: string })[]>();
    for (const row of outline) {
      const list = map.get(row.sectionId);
      if (list) list.push(row);
      else map.set(row.sectionId, [row]);
    }
    return map;
  }, [outline]);

  // The outline is keyed by section, so the accordion and auto-expand track
  // section ids rather than heading ids.
  const sectionOfHeading = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of outline) map.set(row.id, row.sectionId);
    return map;
  }, [outline]);

  const hasOutline = outline.length > 0;

  const toggleFold = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const scrollToHeading = useCallback((id: string, behavior: ScrollBehavior = 'smooth') => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET,
      behavior,
    });
  }, []);

  /**
   * Make one section the only expanded one, and go to its heading. The saved
   * folds are left alone: focus overrides them while it is on, so it stays a
   * reading state and exiting it returns the document exactly as it was.
   */
  const focusSection = useCallback(
    (id: string) => {
      setFocus(id);
      // Folds are instant, so one frame is enough for the new layout to exist.
      requestAnimationFrame(() => {
        const headingId = rowsBySection.get(id)?.[0]?.id;
        if (headingId) scrollToHeading(headingId, 'auto');
      });
    },
    [rowsBySection, scrollToHeading]
  );

  const goSection = useCallback(
    (delta: number) => {
      if (focusIndex < 0) return;
      const next = focusable[focusIndex + delta];
      if (next) focusSection(next.id);
    },
    [focusIndex, focusable, focusSection]
  );

  const enterFocus = useCallback(() => {
    if (focusable.length === 0) return;
    const current = sectionOfHeading.get(active);
    const id = current && focusable.some((s) => s.id === current) ? current : focusable[0].id;
    focusSection(id);
  }, [active, focusable, focusSection, sectionOfHeading]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const first = orderedSections.find((s) => (rowsBySection.get(s.id)?.length ?? 0) > 1);
    return new Set(first ? [first.id] : []);
  });

  const fills = useMemo(() => {
    const map = new Map<string, MotionValue<number>>();
    for (const h of headings) map.set(h.id, motionValue(0));
    return map;
  }, [headings]);

  const metrics = useRef<Metric[]>([]);
  const refreshRef = useRef<() => void>(() => {});

  const measure = useCallback(() => {
    const y = window.scrollY;
    const items: Metric[] = [];

    for (const h of outline) {
      const el = document.getElementById(h.id);
      if (!el) continue;
      // Headings folded away have no box at all. Left in, they would all
      // measure top 0 and drag the scroll-spy back to the start of the page.
      if (!el.getClientRects().length) continue;
      items.push({ id: h.id, top: el.getBoundingClientRect().top + y, end: 0 });
    }

    // Sort by position before pairing sections, so each heading's span ends at
    // the next one visually. The reader can rearrange sections, so relying on
    // array order here produced wildly wrong progress bars.
    items.sort((a, b) => a.top - b.top);
    for (let i = 0; i < items.length; i++) {
      items[i].end = i + 1 < items.length ? items[i + 1].top : document.documentElement.scrollHeight;
    }
    metrics.current = items;
  }, [outline]);

  const update = useCallback(() => {
    const m = metrics.current;
    if (!m.length) return;
    const y = window.scrollY + LINE;

    let current = m[0].id;
    for (const s of m) if (y >= s.top) current = s.id;

    // The final section is often shorter than LINE, so the page runs out of
    // scroll before that heading is ever "passed" and it stays unhighlighted.
    // Once the bottom is reached, the last section is by definition the current one.
    const doc = document.documentElement;
    const atBottom =
      doc.scrollHeight > window.innerHeight + 1 &&
      window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
    if (atBottom) current = m[m.length - 1].id;

    for (let i = 0; i < m.length; i++) {
      const s = m[i];
      const span = Math.max(1, s.end - s.top);
      const p = atBottom && i === m.length - 1 ? 1 : Math.min(1, Math.max(0, (y - s.top) / span));
      fills.get(s.id)?.set(p);
    }
    setActive((prev) => (prev === current ? prev : current));

    // Auto-open the group containing whatever section is being read.
    const section = sectionOfHeading.get(current);
    if (section) setExpanded((prev) => (prev.has(section) ? prev : new Set(prev).add(section)));
  }, [fills, sectionOfHeading]);

  useEffect(() => {
    measure();
    update();

    let frame = 0;
    // Re-measure on every scroll tick rather than only on reflow. Layout can
    // change without the document height changing - reordering sections, or a
    // swap of two same-height blocks - and a stale offset leaves the scroll-spy
    // permanently pointing at the wrong heading.
    const tick = () => {
      frame = 0;
      measure();
      update();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);

    refreshRef.current = schedule;

    const hash = window.location.hash.slice(1);
    if (hash) {
      const el = document.getElementById(hash);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET });
    }

    return () => {
      refreshRef.current = () => {};
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure, update]);

  useEffect(() => {
    refreshRef.current();
  }, [order]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onNavigate = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const sectionId = sectionOfHeading.get(id);
      const section = sectionId ? sectionById.get(sectionId) : undefined;
      const wasFolded =
        sectionId !== undefined &&
        folded.has(sectionId) &&
        section !== undefined &&
        section.level > 0;

      // In focus mode, following a link to another section makes that the
      // section being read, which opens it without touching the saved folds.
      if (sectionId && focus) {
        if (sectionId !== focus) setFocus(sectionId);
      } else if (sectionId) {
        setCollapsed((prev) => {
          if (!prev.has(sectionId)) return prev;
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
      }

      history.pushState(null, '', `#${id}`);
      setDrawerOpen(false);

      if (!wasFolded) {
        scrollToHeading(id);
        return;
      }
      // A heading that was folded has no meaningful position until the section
      // is open again, so wait for the layout before measuring the target.
      window.setTimeout(() => scrollToHeading(id), 0);
    },
    [folded, focus, scrollToHeading, sectionById, sectionOfHeading]
  );

  const nav = (
    <TocNav
      sections={orderedSections}
      rowsBySection={rowsBySection}
      active={active}
      expanded={expanded}
      progress={fills}
      onToggle={onToggle}
      onReorder={setOrder}
      onNavigate={onNavigate}
    />
  );

  const header = (
        <>
          <button className="back" onClick={onReset}>Upload another</button>
          <p className="fname">{name}</p>
          {isReordered && sections.length > 1 && (
            <button className="reset-order" onClick={resetOrder}>
              Restore original order
            </button>
          )}
          {focusable.length > 1 &&
            (focus === null ? (
              <button className="focus-toggle" onClick={enterFocus}>
                Focus mode
              </button>
            ) : (
              <div className="focus-nav">
                <button
                  className="focus-step"
                  aria-label="Previous section"
                  disabled={focusIndex <= 0}
                  onClick={() => goSection(-1)}
                >
                  &#8249;
                </button>
                <span className="focus-count" aria-live="polite">
                  {focusIndex + 1} / {focusable.length}
                </span>
                <button
                  className="focus-step"
                  aria-label="Next section"
                  disabled={focusIndex >= focusable.length - 1}
                  onClick={() => goSection(1)}
                >
                  &#8250;
                </button>
                <button className="focus-exit" onClick={() => setFocus(null)}>
                  Exit focus
                </button>
              </div>
            ))}
        </>
      );

  const blockNode = (b: Block) => (
    <motion.div
      key={b.id}
      className="blk"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.5 }}
      data-level={b.level}
      data-block-id={b.id}
      dangerouslySetInnerHTML={{ __html: renderBlockHtml(b) }}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <ThemeToggle />
      <ExportMenu doc={docRef} name={name} altered={isAltered} />
      <motion.div className="progress" style={{ scaleX: progress }} />

      <div className="shell">
        <aside className="toc">
          {header}
          {nav}
        </aside>

        <article className="doc" ref={docRef}>
          <Reorder.Group
            axis="y"
            values={order}
            onReorder={setOrder}
            as="div"
            className="secs"
          >
            {orderedSections.map((section) => {
              const blocks = edits.get(section.id) ?? section.blocks;
              const editing = editingSection?.id === section.id;
              const isFolded = folded.has(section.id);
              // A section with no heading of its own keeps nothing on screen
              // when folded, so it is hidden whole.
              const hidden = isFolded && section.level === 0;
              const [lead, ...tail] = blocks;
              return (
                <DraggableSection
                  key={section.id}
                  id={section.id}
                  title={section.title}
                  editing={editing}
                  folded={isFolded}
                  hidden={hidden}
                  canFold={!focus && section.level > 0 && tail.length > 0}
                  onToggleFold={() => toggleFold(section.id)}
                  onRequestEdit={(target) => {
                    const cell = editableCell(target);
                    if (cell) {
                      cellTarget.current = cell.td;
                      setEditingCell({ blockId: cell.blockId, path: cell.path, text: cell.text });
                      return;
                    }
                    beginEdit(section, blocks);
                  }}
                  rest={
                    !editing && tail.length > 0 ? (
                      <div className="sec-rest">{tail.map(blockNode)}</div>
                    ) : null
                  }
                >
                  {editing ? (
                    <SectionEditor
                      label="Edit this section's text"
                      initial={editingSection.text}
                      onCancel={() => setEditingSection(null)}
                      onSave={(text) => {
                        setEdits((prev) => new Map(prev).set(section.id, textToBlocks({ ...section, blocks }, text)));
                        setEditingSection(null);
                      }}
                    />
                  ) : (
                    lead && blockNode(lead)
                  )}
                </DraggableSection>
              );
            })}
          </Reorder.Group>
        </article>
        <LinkPreview root={docRef} />
        <TableSort root={docRef} onSort={onTableSorted} />

        {editingCell && cellBox && (
          <div
            className="cell-pop"
            style={{ left: cellBox.left, top: cellBox.top, width: cellBox.width, minHeight: cellBox.height }}
          >
            <SectionEditor
              multiline={false}
              className="cell-editor"
              label="Edit this table cell"
              initial={editingCell.text}
              onCancel={closeCellEditor}
              onSave={(text) => {
                setCellEdits((prev) =>
                  new Map(prev).set(cellKey(editingCell.blockId, editingCell.path), text)
                );
                closeCellEditor();
              }}
            />
          </div>
        )}
      </div>

      {hasOutline && (
        <motion.button
          className="toc-btn"
          onClick={() => setDrawerOpen(true)}
          whileTap={{ scale: 0.94 }}
          aria-label="Open table of contents"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          Contents
        </motion.button>
      )}

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="toc-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              className="toc-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Table of contents"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <button className="back" onClick={onReset}>Upload another</button>
              <p className="fname">{name}</p>
              {isReordered && sections.length > 1 && (
                <button className="reset-order" onClick={resetOrder}>
                  Restore original order
                </button>
              )}
              {nav}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
