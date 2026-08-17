"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

interface BalloonConfig {
  id: number;
  left: number; // percent across the viewport
  color: string;
  delay: number; // seconds
  duration: number; // seconds
  size: number; // px width
  drift: number; // px horizontal drift by the time it exits
  wobble: number; // deg rotation by the time it exits
}

// The app's own brand palette (matching the +/-/×/÷ icons and the brain
// logo on the homepage), not arbitrary confetti colors.
const COLORS = ["var(--coral)", "var(--gold)", "var(--blue)", "var(--green)"];

function makeBalloons(count: number): BalloonConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 88 + 4,
    color: COLORS[i % COLORS.length],
    delay: Math.random() * 0.4,
    duration: 1.9 + Math.random() * 0.9,
    size: 34 + Math.random() * 20,
    drift: (Math.random() - 0.5) * 70,
    wobble: (Math.random() - 0.5) * 18,
  }));
}

// A brief, self-dismissing balloon rise across the whole viewport.
// `celebrationKey` should change (e.g. Date.now()) each time this should
// play again - the balloon set is randomized once per key via useState,
// not regenerated every render, so a single celebration doesn't jump
// around mid-animation.
export default function Celebration({ celebrationKey, onDone }: { celebrationKey: number; onDone: () => void }) {
  const [balloons] = useState(() => makeBalloons(14));

  useEffect(() => {
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrationKey]);

  return (
    <div
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes balloonRise {
          0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { transform: translateY(-115vh) translateX(var(--drift)) rotate(var(--wobble)); opacity: 0; }
        }
      `}</style>
      {balloons.map((b) => (
        <div
          key={b.id}
          style={
            {
              position: "absolute",
              left: `${b.left}%`,
              bottom: -80,
              width: b.size,
              animation: `balloonRise ${b.duration}s ease-in ${b.delay}s forwards`,
              "--drift": `${b.drift}px`,
              "--wobble": `${b.wobble}deg`,
            } as CSSProperties
          }
        >
          <svg viewBox="0 0 40 56" width="100%" height="auto">
            <ellipse cx="20" cy="20" rx="18" ry="20" fill={b.color} />
            <ellipse cx="14" cy="12" rx="5" ry="7" fill="#fff" opacity="0.25" />
            <path d="M20 40 L17 44 L23 44 Z" fill={b.color} />
            <line x1="20" y1="44" x2="20" y2="56" stroke="var(--ink-soft)" strokeWidth="1" />
          </svg>
        </div>
      ))}
    </div>
  );
}
