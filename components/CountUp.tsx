'use client';
import { useEffect, type RefObject } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { formatCount, scanForNumbers } from '@/lib/countup';

type Props = {
  root: RefObject<HTMLElement | null>;
  /** Re-scans whenever the rendered document changes. */
  token: string;
};

/**
 * Hover-driven count-up. Scrolling past a number deliberately does nothing:
 * only pointing at it (or tapping it) plays the animation, once.
 */
export default function CountUp({ root, token }: Props) {
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const spans = scanForNumbers(el);
    if (!spans.length || reduced) return;

    const running = new Map<HTMLElement, ReturnType<typeof animate>>();

    // One shot: the value plays and then stays put.
    const play = (span: HTMLElement) => {
      if (span.dataset.played === '1') return;
      span.dataset.played = '1';
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

    // Delegated so it survives re-scans of the article. pointerdown covers touch.
    const onPointer = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target.closest('.countup') : null;
      if (target) play(target as HTMLElement);
    };
    el.addEventListener('pointerover', onPointer);
    el.addEventListener('pointerdown', onPointer);

    return () => {
      el.removeEventListener('pointerover', onPointer);
      el.removeEventListener('pointerdown', onPointer);
      running.forEach((c) => c.stop());
      running.clear();
    };
  }, [root, token, reduced]);

  return null;
}