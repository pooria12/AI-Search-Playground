import { useCallback, useEffect, useRef, useState } from "react";

/** Events per second for speed settings 1..10. */
export const SPEED_RATES = [2, 5, 10, 20, 40, 80, 150, 300, 600, 1200];

export interface Playback {
  step: number;
  playing: boolean;
  speed: number;
  setSpeed: (speed: number) => void;
  seek: (step: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepBy: (delta: number) => void;
  reset: () => void;
  toEnd: () => void;
}

/**
 * Drives an animation over `total` steps. Uses requestAnimationFrame with a
 * fractional accumulator so any speed is smooth, and keeps all side effects
 * out of state updaters (they run twice in StrictMode).
 */
export function usePlayback(total: number): Playback {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);

  const totalRef = useRef(total);
  const speedRef = useRef(speed);
  const stepRef = useRef(0);
  totalRef.current = total;
  speedRef.current = speed;

  const commit = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(next, totalRef.current));
    stepRef.current = clamped;
    setStep(clamped);
    return clamped;
  }, []);

  // A new trace starts from the beginning, paused.
  useEffect(() => {
    setPlaying(false);
    commit(0);
  }, [total, commit]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * SPEED_RATES[speedRef.current - 1];
      last = now;
      const whole = Math.floor(acc);
      if (whole > 0) {
        acc -= whole;
        const next = commit(stepRef.current + whole);
        if (next >= totalRef.current) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, commit]);

  const play = useCallback(() => {
    if (totalRef.current === 0) return;
    if (stepRef.current >= totalRef.current) commit(0); // replay from the start
    setPlaying(true);
  }, [commit]);
  const pause = useCallback(() => setPlaying(false), []);

  return {
    step,
    playing,
    speed,
    setSpeed,
    seek: (s) => {
      setPlaying(false);
      commit(s);
    },
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    stepBy: (d) => {
      setPlaying(false);
      commit(stepRef.current + d);
    },
    reset: () => {
      setPlaying(false);
      commit(0);
    },
    toEnd: () => {
      setPlaying(false);
      commit(totalRef.current);
    },
  };
}
