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
import TableSort from '@/components/TableSort';
import ThemeToggle from '@/components/ThemeToggle';
import TocNav from '@/components/TocNav';
import { type Heading } from '@/lib/toc';
import { groupSections, restoreOrder, storageKeyFor, type Block, type Section } from '@/lib/sections';

type Metric = { id: string; top: number; end: number };

/**
 * A draggable section. Dragging is started from the handle rather than the body
 * so that selecting and copying text inside a section still works.
 */
function DraggableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const controls = useDragControls();

  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls} className="sec">
      {/* Decorative: keyboard reordering is not implemented, the reset
          control in the sidebar is the accessible way to undo a change. */}
      <span className="sec-handle" aria-hidden="true" onPointerDown={(e) => controls.start(e)}>
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2.5" cy="2" r="1.4" /><circle cx="7.5" cy="2" r="1.4" />
          <circle cx="2.5" cy="7" r="1.4" /><circle cx="7.5" cy="7" r="1.4" />
          <circle cx="2.5" cy="12" r="1.4" /><circle cx="7.5" cy="12" r="1.4" />
        </svg>
      </span>
      <div className="sec-body">{children}</div>
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

    for (const t of Array.from(doc.querySelectorAll('table'))) {
      if (isLayoutTable(t)) continue;
      t.classList.add('neon-table', 'sortable-table');
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

  // A table sort changes the document too, and it is applied straight to the
  // DOM, so the count is lifted into state purely to flag the export CTA.
  const [sortedTables, setSortedTables] = useState(0);
  const onTableSorted = useCallback(() => setSortedTables((n) => n + 1), []);
  const isAltered = isReordered || sortedTables > 0;

  // Save the arrangement so reopening the same file restores it.
  useEffect(() => {
    window.localStorage.setItem(storageKeyFor(html), JSON.stringify(order));
  }, [html, order]);

  const resetOrder = useCallback(() => {
    setOrder(naturalOrder);
  }, [naturalOrder]);

  const orderedSections = useMemo(
    () => order.map((id) => sectionById.get(id)).filter((s): s is Section => s !== undefined),
    [order, sectionById]
  );

  const headingById = useMemo(() => new Map(headings.map((h) => [h.id, h])), [headings]);

  // The outline follows the reader's arrangement, not the parse order, so the
  // contents and the document can never disagree.
  const outline = useMemo(() => {
    const out: (Heading & { sectionId: string })[] = [];
    for (const section of orderedSections) {
      for (const block of section.blocks) {
        for (const id of block.headingIds) {
          const heading = headingById.get(id);
          if (heading) out.push({ ...heading, sectionId: section.id });
        }
      }
    }
    return out;
  }, [orderedSections, headingById]);

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

  const onNavigate = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top, behavior: 'smooth' });
    history.pushState(null, '', `#${id}`);
    setDrawerOpen(false);
  }, []);

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
        </>
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
          <Reorder.Group axis="y" values={order} onReorder={setOrder} as="div" className="secs">
            {orderedSections.map((section) => (
              <DraggableSection key={section.id} id={section.id}>
                {section.blocks.map((b) => (
                  <motion.div
                    key={b.id}
                    className="blk"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, margin: '-8% 0px' }}
                    transition={{ duration: 0.5 }}
                    data-level={b.level}
                    dangerouslySetInnerHTML={{ __html: b.html }}
                  />
                ))}
              </DraggableSection>
            ))}
          </Reorder.Group>
        </article>
        <LinkPreview root={docRef} />
        <TableSort root={docRef} onSort={onTableSorted} />
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
