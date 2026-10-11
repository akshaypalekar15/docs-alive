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

    let observer: IntersectionObserver | null = null;
    const running = new Map<HTMLElement, ReturnType<typeof animate>>();

    // One shot: whichever trigger arrives first wins, and the value settles.
    const play = (span: HTMLElement) => {
      if (span.dataset.played === '1') return;
      span.dataset.played = '1';
      observer?.unobserve(span);
      running.set(
        span,
        animate(0, Number(span.dataset.count), {
          duration: 1.2,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (value) => {
            span.textContent = formatCount(value, Number(span.dataset.decimals));
          },
        })
      );
    };

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) play(entry.target as HTMLElement);
      },
      { threshold: 0.5 }
    );
    spans.forEach((span) => observer?.observe(span));

    // Delegated so it survives re-scans of the article.
    const onPointer = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target.closest('.countup') : null;
      if (target) play(target as HTMLElement);
    };
    el.addEventListener('pointerover', onPointer);
    el.addEventListener('pointerdown', onPointer);

    return () => {
      observer?.disconnect();
      el.removeEventListener('pointerover', onPointer);
      el.removeEventListener('pointerdown', onPointer);
      running.forEach((c) => c.stop());
      running.clear();
    };
  }, [root, token, reduced]);

  return null;
}