'use client';
import { useEffect, useMemo, useState } from 'react';
import { MotionConfig, motion, useScroll, useSpring } from 'framer-motion';
import DOMPurify from 'dompurify';
import Background from '@/components/Background';
import Cursor from '@/components/Cursor';
import ThemeToggle from '@/components/ThemeToggle';

type Block = { html: string; id: string; level: number; text: string };

export default function Viewer({ html, name, onReset }: { html: string; name: string; onReset: () => void }) {
  const [active, setActive] = useState('');
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  const blocks: Block[] = useMemo(() => {
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html), 'text/html');
    let n = 0;
    return Array.from(doc.body.children).map((el) => {
      const isHeading = /^H[1-3]$/.test(el.tagName);
      if (isHeading) el.id = `h-${n++}`;
      return { html: el.outerHTML, id: el.id, level: isHeading ? Number(el.tagName[1]) : 0, text: el.textContent ?? '' };
    });
  }, [html]);

  const toc = blocks.filter((b) => b.level > 0);

  // Scroll-spy: highlight the heading nearest the top of the viewport
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '0px 0px -75% 0px' }
    );
    toc.forEach((b) => { const el = document.getElementById(b.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [toc]);

  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <Cursor />
      <ThemeToggle />
      <motion.div className="progress" style={{ scaleX: progress }} />
      <div className="shell">
        <aside className="toc">
          <button className="back" onClick={onReset}>Upload another</button>
          <p className="fname">{name}</p>
          <nav>
            {toc.map((b) => (
              <a key={b.id} href={`#${b.id}`} data-active={active === b.id} style={{ paddingLeft: (b.level - 1) * 14 }}>
                {b.text}
              </a>
            ))}
          </nav>
        </aside>
        <article className="doc">
          {blocks.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: '-8% 0px' }}
              transition={{ duration: 0.5 }}
              dangerouslySetInnerHTML={{ __html: b.html }}
            />
          ))}
        </article>
      </div>
    </MotionConfig>
  );
}
