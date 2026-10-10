'use client';
import { useEffect } from 'react';
import {
  MotionConfig,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';

type Blob = {
  size: number;
  left: string;
  top: string;
  color: string;
  depth: number;
  duration: number;
  delay: number;
};

type Mote = {
  left: number;
  top: number;
  r: number;
  depth: number;
  duration: number;
  delay: number;
};

const BLOBS: Blob[] = [
  { size: 46, left: '-8%', top: '-14%', color: 'var(--blob-1)', depth: 70, duration: 28, delay: 0 },
  { size: 38, left: '58%', top: '4%', color: 'var(--blob-2)', depth: -45, duration: 34, delay: 1.5 },
  { size: 34, left: '16%', top: '66%', color: 'var(--blob-3)', depth: 115, duration: 30, delay: 3 },
];

const MOTES: Mote[] = [
  { left: 8, top: 24, r: 2, depth: 60, duration: 19, delay: 0 },
  { left: 23, top: 68, r: 3, depth: -40, duration: 24, delay: 2.4 },
  { left: 37, top: 12, r: 2, depth: 95, duration: 21, delay: 5.1 },
  { left: 51, top: 82, r: 2, depth: -70, duration: 26, delay: 1.2 },
  { left: 64, top: 38, r: 3, depth: 50, duration: 17, delay: 3.8 },
  { left: 72, top: 74, r: 2, depth: -95, duration: 23, delay: 6.5 },
  { left: 84, top: 16, r: 3, depth: 80, duration: 20, delay: 0.8 },
  { left: 91, top: 58, r: 2, depth: -55, duration: 25, delay: 4.2 },
  { left: 14, top: 46, r: 2, depth: 110, duration: 22, delay: 7.1 },
  { left: 44, top: 30, r: 2, depth: -85, duration: 18, delay: 5.6 },
  { left: 68, top: 8, r: 2, depth: 65, duration: 27, delay: 2.1 },
  { left: 79, top: 90, r: 3, depth: -60, duration: 21, delay: 8.3 },
  { left: 29, top: 88, r: 2, depth: 45, duration: 24, delay: 9.4 },
  { left: 96, top: 33, r: 2, depth: -100, duration: 19, delay: 6.9 },
  { left: 58, top: 54, r: 2, depth: 75, duration: 23, delay: 10.2 },
  { left: 4, top: 78, r: 3, depth: -50, duration: 20, delay: 11.5 },
];

function Blob({ size, left, top, color, depth, duration, delay, px, py }: Blob & { px: MotionValue<number>; py: MotionValue<number> }) {
  const x = useTransform(px, (v) => v * depth);
  const y = useTransform(py, (v) => v * depth * 0.7);

  return (
    <motion.div className="bg-layer" style={{ x, y }}>
      <motion.div
        className="bg-blob"
        style={{ width: `${size}vw`, height: `${size}vw`, left, top, background: `radial-gradient(circle at 50% 50%, ${color}, rgba(255,255,255,0) 70%)` }}
        animate={{ scale: [1, 1.12, 0.94, 1], x: [0, 60, -30, 0], y: [0, -46, 32, 0] }}
        transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}

function Mote({ left, top, r, depth, duration, delay, px, py }: Mote & { px: MotionValue<number>; py: MotionValue<number> }) {
  const x = useTransform(px, (v) => v * depth);
  const y = useTransform(py, (v) => v * depth * 0.6);

  return (
    <motion.div className="bg-layer" style={{ x, y }}>
      <motion.div
        className="bg-mote"
        style={{ left: `${left}%`, top: `${top}%`, width: r, height: r }}
        animate={{ y: [0, -140, 0], opacity: [0, 0.7, 0] }}
        transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}

export default function Background() {
  const reduced = useReducedMotion();
  const px = useSpring(useMotionValue(0), { stiffness: 40, damping: 18, mass: 0.6 });
  const py = useSpring(useMotionValue(0), { stiffness: 40, damping: 18, mass: 0.6 });

  const glowX = useTransform(px, (v) => v * 26);
  const glowY = useTransform(py, (v) => v * 26);
  const gridX = useTransform(px, (v) => v * -12);
  const gridY = useTransform(py, (v) => v * -12);

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      px.set(((e.clientX / window.innerWidth) - 0.5) * 2);
      py.set(((e.clientY / window.innerHeight) - 0.5) * 2);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [px, py, reduced]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg" aria-hidden="true">
      <motion.div className="bg-layer" style={{ x: glowX, y: glowY }}>
        <motion.div
          className="bg-glow"
          animate={{ opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      <motion.div className="bg-layer" style={{ x: gridX, y: gridY }}>
        <motion.div
          className="bg-grid"
          animate={{ x: ['0px', '64px'], y: ['0px', '64px'] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>

      {BLOBS.map((b) => (
        <Blob key={b.left} {...b} px={px} py={py} />
      ))}

      {MOTES.map((m) => (
        <Mote key={m.left} {...m} px={px} py={py} />
      ))}
      </div>
    </MotionConfig>
  );
}
