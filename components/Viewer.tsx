'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  motionValue,
  useScroll,
  useSpring,
  type MotionValue,
} from 'framer-motion';
import DOMPurify from 'dompurify';
import Background from '@/components/Background';
import CountUp from '@/components/CountUp';
import LinkPreview from '@/components/LinkPreview';
import ThemeToggle from '@/components/ThemeToggle';
import TocNav from '@/components/TocNav';
import { buildTree, rootOf, type Heading } from '@/lib/toc';

type Block = { html: string; level: number };

type Metric = { id: string; top: number; end: number };

/**
 * A table with a single row and single cell is a layout wrapper, not data —
 * mammoth emits these for things like a resume header block.
 */
function isLayoutTable(el: Element): boolean {
  if (el.tagName !== 'TABLE') return false;
  const rows = el.querySelectorAll('tr');
  if (rows.length !== 1) return false;
  return rows[0].querySelectorAll('td, th').length === 1;
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
      if (!isLayoutTable(t)) t.classList.add('neon-table');
    }

    const hs = collectHeadings(doc, false);
    const found = hs.length < 2 ? collectHeadings(doc, true) : hs;
    const bs: Block[] = Array.from(doc.body.children).map((el) => ({
      html: el.outerHTML,
      level: /^H[1-3]$/.test(el.tagName) ? Number(el.tagName[1]) : 0,
    }));
    return { blocks: bs, headings: found };
  }, [html]);

  const tree = useMemo(() => buildTree(headings), [headings]);
  const ancestor = useMemo(() => rootOf(tree), [tree]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.length ? [tree[0].id] : []));

  const fills = useMemo(() => {
    const map = new Map<string, MotionValue<number>>();
    for (const h of headings) map.set(h.id, motionValue(0));
    return map;
  }, [headings]);

  const metrics = useRef<Metric[]>([]);

  const measure = useCallback(() => {
    const y = window.scrollY;
    const next: Metric[] = [];
    for (let i = 0; i < headings.length; i++) {
      const el = document.getElementById(headings[i].id);
      if (!el) continue;
      const top = el.getBoundingClientRect().top + y;
      const nextEl = headings[i + 1] ? document.getElementById(headings[i + 1].id) : null;
      const end = nextEl
        ? nextEl.getBoundingClientRect().top + y
        : document.documentElement.scrollHeight;
      next.push({ id: headings[i].id, top, end });
    }
    metrics.current = next;
  }, [headings]);

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
    const root = ancestor[current];
    if (root) setExpanded((prev) => (prev.has(root) ? prev : new Set(prev).add(root)));
  }, [fills, ancestor]);

  useEffect(() => {
    measure();
    update();

    let frame = 0;
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    // Reflow must re-measure, not just re-evaluate: images decoding or fonts
    // swapping move every heading after the initial mount measurement, which
    // would leave the scroll-spy permanently out of sync.
    const onReflow = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); update(); });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onReflow);
    const ro = new ResizeObserver(onReflow);
    ro.observe(document.body);

    const hash = window.location.hash.slice(1);
    if (hash) {
      const el = document.getElementById(hash);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET });
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onReflow);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure, update]);

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
      nodes={tree}
      active={active}
      expanded={expanded}
      progress={fills}
      onToggle={onToggle}
      onNavigate={onNavigate}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <ThemeToggle />
      <motion.div className="progress" style={{ scaleX: progress }} />

      <div className="shell">
        <aside className="toc">
          <button className="back" onClick={onReset}>Upload another</button>
          <p className="fname">{name}</p>
          {nav}
        </aside>

        <article className="doc" ref={docRef}>
          {blocks.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: '-8% 0px' }}
              transition={{ duration: 0.5 }}
              data-level={b.level}
              dangerouslySetInnerHTML={{ __html: b.html }}
            />
          ))}
          <CountUp root={docRef} token={html} />
        </article>
        <LinkPreview root={docRef} />
      </div>

      {headings.length > 0 && (
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
              {nav}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
