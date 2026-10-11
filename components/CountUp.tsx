'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { formatCount, scanForNumbers } from '@/lib/countup';

type Props = {
  root: RefObject<HTMLElement | null>;
  /** Re-scans whenever the rendered document changes. */
  token: string;
};

/** The hover zone that owns a number: its paragraph, list item or table cell. */
const ZONE_SELECTOR = 'p, li, td, th, blockquote, pre, figcaption, h1, h2, h3, h4, h5, h6';

function zoneOf(el: Element): Element {
  return el.closest(ZONE_SELECTOR) ?? el.closest('.doc > div') ?? el;
}

/**
 * Hover-driven count-up. Pointing anywhere in the paragraph or table cell that
 * owns a number counts every number in it up; moving away restores them.
 */
export default function CountUp({ root, token }: Props) {
  const reduced = useReducedMotion();
  const zone = useRef<Element | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (scanForNumbers(el).length === 0 || reduced) return;

    const running = new Map<HTMLElement, ReturnType<typeof animate>>();

    const spansIn = (z: Element) => Array.from(z.querySelectorAll<HTMLElement>('.countup'));

    /** Put a zone's numbers back to their real values. */
    const reset = (z: Element) => {
      for (const span of spansIn(z)) {
        running.get(span)?.stop();
        running.delete(span);
        span.textContent = formatCount(Number(span.dataset.count), Number(span.dataset.decimals));
      }
    };

    const play = (z: Element) => {
      for (const span of spansIn(z)) {
        running.get(span)?.stop();
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
      }
    };

    // Delegated, so it survives re-scans of the article.
    const onOver = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      const next = zoneOf(e.target);
      if (next === zone.current) return;
      if (zone.current) reset(zone.current);
      zone.current = next;
      if (next.querySelector('.countup')) play(next);
    };

    const onLeave = () => {
      if (zone.current) reset(zone.current);
      zone.current = null;
    };

    el.addEventListener('pointerover', onOver);
    el.addEventListener('pointerdown', onOver);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      el.removeEventListener('pointerover', onOver);
      el.removeEventListener('pointerdown', onOver);
      el.removeEventListener('pointerleave', onLeave);
      running.forEach((c) => c.stop());
      running.clear();
      zone.current = null;
    };
  }, [root, token, reduced]);

  return null;
}