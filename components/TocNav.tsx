'use client';
import { AnimatePresence, motion, type MotionValue } from 'framer-motion';
import type { TocNode } from '@/lib/toc';

type Props = {
  nodes: TocNode[];
  active: string;
  expanded: Set<string>;
  progress: Map<string, MotionValue<number>>;
  onToggle: (id: string) => void;
  onNavigate: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
};

function Leaf({ node, active, progress, onNavigate }: Omit<Props, 'nodes' | 'expanded' | 'onToggle'> & { node: TocNode }) {
  const fill = progress.get(node.id);

  return (
    <a
      href={`#${node.id}`}
      className="toc-row"
      data-active={active === node.id}
      style={{ paddingLeft: 12 + (node.level - 1) * 12 }}
      onClick={(e) => onNavigate(e, node.id)}
      title={node.text}
    >
      {fill && <motion.span className="toc-bar" style={{ scaleX: fill }} aria-hidden="true" />}
      <span className="toc-label">{node.text}</span>
    </a>
  );
}

export default function TocNav({ nodes, active, expanded, progress, onToggle, onNavigate }: Props) {
  if (!nodes.length) return null;

  return (
    <nav>
      {nodes.map((node) =>
        node.children.length ? (
          <div key={node.id} className="toc-group">
            <button
              className="toc-row toc-parent"
              data-active={active === node.id}
              aria-expanded={expanded.has(node.id)}
              onClick={() => onToggle(node.id)}
              title={node.text}
            >
              <motion.span
                className="toc-chev"
                animate={{ rotate: expanded.has(node.id) ? 90 : 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                aria-hidden="true"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </motion.span>
              <span className="toc-label">{node.text}</span>
            </button>

            <AnimatePresence initial={false}>
              {expanded.has(node.id) && (
                <motion.div
                  className="toc-children"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                >
                  {node.children.map((child) => (
                    <Leaf key={child.id} node={child} active={active} progress={progress} onNavigate={onNavigate} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Leaf key={node.id} node={node} active={active} progress={progress} onNavigate={onNavigate} />
        )
      )}
    </nav>
  );
}
