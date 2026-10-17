'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type Meta = {
  title: string | null;
  description: string | null;
  publisher: string | null;
  image: string | null;
};

type Preview = { href: string; meta: Meta | null; loading: boolean };

/** Don't fire on a cursor merely passing over a link. */
const HOVER_DELAY = 350;
const CARD_WIDTH = 320;
const CARD_ESTIMATED_HEIGHT = 190;

/** Shared across mounts so revisiting a link is instant. Failures cache too. */
const cache = new Map<string, Meta | null>();

async function fetchMeta(href: string): Promise<Meta | null> {
  const cached = cache.get(href);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(href)}`);
    const json = await res.json();
    const meta: Meta | null =
      json.status === 'success'
        ? {
            title: json.data?.title ?? null,
            description: json.data?.description ?? null,
            publisher: json.data?.publisher ?? null,
            image: json.data?.image?.url ?? null,
          }
        : null;
    cache.set(href, meta);
    return meta;
  } catch {
    cache.set(href, null);
    return null;
  }
}

/** Host and path only - query strings can carry sensitive tokens. */
function shortUrl(href: string): string {
  try {
    const u = new URL(href);
    return u.hostname + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return href;
  }
}

const isExternal = (el: Element): HTMLAnchorElement | null => {
  const a = el.closest('a[href]');
  if (!a) return null;
  return /^https?:\/\//i.test(a.getAttribute('href') ?? '') ? (a as HTMLAnchorElement) : null;
};

export default function LinkPreview({ root }: { root: RefObject<HTMLElement | null> }) {
  const reduced = useReducedMotion();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<string | null>(null);
  const token = useRef(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const hide = () => {
      token.current++;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setPreview(null);
      setPos(null);
    };

    const place = (rect: DOMRect) => {
      const left = Math.max(
        12,
        Math.min(rect.left, window.innerWidth - CARD_WIDTH - 12)
      );
      const above = rect.bottom + CARD_ESTIMATED_HEIGHT > window.innerHeight - 12;
      setPos({
        left,
        // When flipped, the card is anchored from the bottom edge instead.
        top: above ? rect.top - 10 : rect.bottom + 10,
        above,
      });
    };

    const show = (anchor: HTMLAnchorElement, delay: number) => {
      const href = anchor.getAttribute('href') ?? '';
      current.current = href;
      const my = ++token.current;

      place(anchor.getBoundingClientRect());
      setPreview({ href, meta: cache.get(href) ?? null, loading: true });

      timer.current = setTimeout(async () => {
        const meta = await fetchMeta(href);
        if (token.current !== my) return;
        setPreview({ href, meta, loading: false });
      }, delay);
    };

    const onOver = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      const anchor = isExternal(e.target);
      if (!anchor) {
        if (current.current) hide();
        return;
      }
      const href = anchor.getAttribute('href');
      if (href === current.current) return;
      if (timer.current) clearTimeout(timer.current);
      show(anchor, HOVER_DELAY);
    };

    // Keyboard users get it too, without the hover delay.
    const onFocus = (e: FocusEvent) => {
      if (!(e.target instanceof Element)) return;
      const anchor = isExternal(e.target);
      if (!anchor) return;
      if (timer.current) clearTimeout(timer.current);
      show(anchor, 0);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    el.addEventListener('pointerover', onOver);
    el.addEventListener('pointerdown', onOver);
    el.addEventListener('focusin', onFocus);
    el.addEventListener('pointerleave', hide);
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('keydown', onKey);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      el.removeEventListener('pointerover', onOver);
      el.removeEventListener('pointerdown', onOver);
      el.removeEventListener('focusin', onFocus);
      el.removeEventListener('pointerleave', hide);
      window.removeEventListener('scroll', hide);
      window.removeEventListener('keydown', onKey);
    };
  }, [root]);

  return (
    <AnimatePresence>
      {preview && pos && (
        <motion.div
          className="lp"
          role="tooltip"
          style={{
            left: pos.left,
            width: CARD_WIDTH,
            ...(pos.above ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
          }}
          initial={reduced ? false : { opacity: 0, y: pos.above ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {preview.meta?.image && (
            /* Hosts are discovered at runtime from the preview API, so an
               open-ended next/image remotePatterns allowlist would be required. */
            // eslint-disable-next-line @next/next/no-img-element
            <img className="lp-img" src={preview.meta.image} alt="" loading="lazy" />
          )}
          <div className="lp-body">
            <div className="lp-host">{shortUrl(preview.href)}</div>
            {preview.loading ? (
              <div className="lp-skel" />
            ) : (
              preview.meta?.title && <div className="lp-title">{preview.meta.title}</div>
            )}
            {preview.meta?.description && (
              <p className="lp-desc">{preview.meta.description}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}