'use client';
import { useEffect, type RefObject } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { formatCount, scanForNumbers } from '@/lib/countup';

type Props = {
  root: RefObject<HTMLElement | null>;
  /** Re-scans whenever the rendered document changes. */
  token: string;
};

export default function CountUp({ root, token }: Props) {
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const spans = scanForNumbers(el);
    if (!spans.length || reduced) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const span = entry.target as HTMLSpanElement;
          const target = Number(span.dataset.count);
          const decimals = Number(span.dataset.decimals);
          animate(0, target, {
            duration: 1.2,
            ease: [0.16, 1, 0.3, 1],
            onUpdate: (value) => {
              span.textContent = formatCount(value, decimals);
            },
          });
        }
      },
      { threshold: 0.5 }
    );

    spans.forEach((span) => observer.observe(span));
    return () => observer.disconnect();
  }, [root, token, reduced]);

  return null;
}