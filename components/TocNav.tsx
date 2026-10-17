'use client';
import { useMemo } from 'react';
import { AnimatePresence, Reorder, motion, useDragControls, type MotionValue } from 'framer-motion';
import type { Heading } from '@/lib/toc';
import type { Section } from '@/lib/sections';

type OutlineRow = Heading & { sectionId: string };

type Props = {
  /** Sections in the reader's current order. Each is one draggable row. */
  sections: Section[];
  /** Headings per section id, in document order. A stable Map, not a callback. */
  rowsBySection: Map<string, OutlineRow[]>;
  active: string;
  expanded: Set<string>;
  progress: Map<string, MotionValue<number>>;
  onToggle: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onNavigate: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
};

function TocRow({
  node,
  depth,
  draggable,
  active,
  fill,
  onNavigate,
}: {
  node: OutlineRow;
  depth: number;
  draggable: boolean;
  active: boolean;
  fill?: MotionValue<number>;
  onNavigate: Props['onNavigate'];
}) {
  const label = (
    <>
      {fill && <motion.span className="toc-bar" style={{ scaleX: fill }} aria-hidden="true" />}
      <span className="toc-label">{node.text}</span>
    </>
  );
  const style = { paddingLeft: 12 + depth * 12 };

  if (!draggable) {
    return (
      <a
        className="toc-row toc-static"
        href={`#${node.id}`}
        data-active={active}
        style={style}
        onClick={(e) => onNavigate(e, node.id)}
        title={node.text}
      >
        {label}
      </a>
    );
  }

  return (
    <a
      className="toc-row toc-drag"
      href={`#${node.id}`}
      data-active={active}
      style={style}
      onClick={(e) => onNavigate(e, node.id)}
      title={node.text}
    >
      {label}
    </a>
  );
}

/**
 * A section: its leading heading is the drag handle for the whole group, and
 * any further headings in the same section sit indented beneath it.
 */
function TocSection({
  section,
  rows,
  active,
  expanded,
  progress,
  onToggle,
  onNavigate,
}: Omit<Props, 'sections' | 'onReorder' | 'rowsBySection'> & {
  section: Section;
  rows: OutlineRow[];
}) {
  const controls = useDragControls();
  const [lead, ...rest] = rows;
  if (!lead) return null;

  const isOpen = expanded.has(section.id);
  const fill = progress.get(lead.id);

  return (
    <Reorder.Item
      value={section.id}
      dragListener={false}
      dragControls={controls}
      className="toc-item"
    >
      {/* Direct child of the item, matching the document's section handle:
          nested inside the row wrapper the drag never starts. */}
      <span
        className="toc-grip"
        aria-hidden="true"
        onPointerDown={(e) => controls.start(e)}
      >
        <svg width="9" height="12" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2.5" cy="2" r="1.4" /><circle cx="7.5" cy="2" r="1.4" />
          <circle cx="2.5" cy="7" r="1.4" /><circle cx="7.5" cy="7" r="1.4" />
          <circle cx="2.5" cy="12" r="1.4" /><circle cx="7.5" cy="12" r="1.4" />
        </svg>
      </span>

      <div className="toc-rowwrap">
        <TocRow node={lead} depth={0} draggable active={active === lead.id} fill={fill} onNavigate={onNavigate} />

        {rest.length > 0 && (
          <button
            className="toc-twisty"
            aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse ${lead.text}` : `Expand ${lead.text}`}
            onClick={() => onToggle(section.id)}
          >
            <motion.span
              className="toc-chev"
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              aria-hidden="true"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </motion.span>
          </button>
        )}

        </div>

      {rest.length > 0 && (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              className="toc-children"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
            >
              {rest.map((row) => (
                <TocRow
                  key={row.id}
                  node={row}
                  depth={1}
                  draggable={false}
                  active={active === row.id}
                  fill={progress.get(row.id)}
                  onNavigate={onNavigate}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </Reorder.Item>
  );
}

export default function TocNav({
  sections,
  rowsBySection,
  active,
  expanded,
  progress,
  onToggle,
  onReorder,
  onNavigate,
}: Props) {
  // Reorder re-syncs when the values array changes identity, so both of these
  // must be stable across renders or a drag is cancelled as it starts.
  const draggable = useMemo(
    () => sections.filter((s) => (rowsBySection.get(s.id)?.length ?? 0) > 0),
    [sections, rowsBySection]
  );
  const values = useMemo(() => draggable.map((s) => s.id), [draggable]);

  if (draggable.length === 0) return null;

  return (
    <Reorder.Group axis="y" values={values} onReorder={onReorder} as="nav" className="toc-nav">
      {draggable.map((section) => (
        <TocSection
          key={section.id}
          section={section}
          rows={rowsBySection.get(section.id) ?? []}
          active={active}
          expanded={expanded}
          progress={progress}
          onToggle={onToggle}
          onNavigate={onNavigate}
        />
      ))}
    </Reorder.Group>
  );
}