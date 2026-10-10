'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

const OFFSCREEN = -9999;
const INTERACTIVE = 'a, button, label, input, textarea, select, [role="button"]';

type Ripple = { id: number; x: number; y: number };

export default function Cursor() {
  const reduced = useReducedMotion();
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  const x = useMotionValue(OFFSCREEN);
  const y = useMotionValue(OFFSCREEN);

  const dotX = useSpring(x, { stiffness: 700, damping: 40, mass: 0.35 });
  const dotY = useSpring(y, { stiffness: 700, damping: 40, mass: 0.35 });
  const ringX = useSpring(x, { stiffness: 180, damping: 20, mass: 0.5 });
  const ringY = useSpring(y, { stiffness: 180, damping: 20, mass: 0.5 });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('has-cursor', !reduced);
    return () => root.classList.remove('has-cursor');
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setHidden(false);
    };
    const onOver = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      setHovering(!!el);
    };
    const onDown = (e: PointerEvent) => {
      setPressed(true);
      const id = nextId.current++;
      setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }]);
    };
    const onUp = () => setPressed(false);
    const onLeave = () => {
      setHidden(true);
      x.set(OFFSCREEN);
      y.set(OFFSCREEN);
    };
    const onContext = () => setRipples([]);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('contextmenu', onContext);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [x, y, reduced]);

  if (reduced) return null;

  return (
    <>
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="cur cur-ripple"
            style={{ left: r.x, top: r.y }}
            initial={{ scale: 0.15, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            onAnimationComplete={() => setRipples((list) => list.filter((i) => i.id !== r.id))}
            aria-hidden="true"
          />
        ))}
      </AnimatePresence>

      <motion.div className="cur cur-ring" style={{ x: ringX, y: ringY }} aria-hidden="true">
        <motion.div
          className="cur-inner"
          animate={{ scale: pressed ? 0.85 : hovering ? 1.9 : 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        />
      </motion.div>

      <motion.div className="cur cur-dot" style={{ x: dotX, y: dotY, opacity: hidden ? 0 : 1 }} aria-hidden="true">
        <motion.div
          className="cur-inner"
          animate={{ scale: pressed ? 0.5 : hovering ? 0.6 : 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        />
      </motion.div>
    </>
  );
}
