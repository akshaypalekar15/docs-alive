'use client';
import { useEffect, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, type MotionValue } from 'framer-motion';

const OFFSCREEN = -9999;
const INTERACTIVE = 'a, button, label, input, textarea, select, [role="button"]';

const ECHOES = [
  { size: 6, opacity: 0.3, stiffness: 240, damping: 26 },
  { size: 5, opacity: 0.18, stiffness: 160, damping: 24 },
  { size: 4, opacity: 0.1, stiffness: 100, damping: 22 },
];

function Echo({ size, opacity, stiffness, damping, x, y }: { size: number; opacity: number; stiffness: number; damping: number; x: MotionValue<number>; y: MotionValue<number> }) {
  const sx = useSpring(x, { stiffness, damping, mass: 0.6 });
  const sy = useSpring(y, { stiffness, damping, mass: 0.6 });

  return (
    <motion.div
      className="cur cur-echo"
      style={{ x: sx, y: sy, width: size, height: size, opacity }}
      aria-hidden="true"
    />
  );
}

export default function Cursor() {
  const reduced = useReducedMotion();
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hidden, setHidden] = useState(true);

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
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    const onLeave = () => {
      setHidden(true);
      x.set(OFFSCREEN);
      y.set(OFFSCREEN);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [x, y, reduced]);

  if (reduced) return null;

  return (
    <>
      {ECHOES.map((e, i) => (
        <Echo key={i} {...e} x={x} y={y} />
      ))}

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
