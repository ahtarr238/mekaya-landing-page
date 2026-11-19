"use client";

import { useEffect, useRef, useState } from "react";
import { BOOT_PROGRESS, emitBootDone, scramble } from "./boot";

const MIN_MS = 1400;

/**
 * Boot sheet: warm white gradient over the page while the machine model downloads, with
 * scrambling glyphs in the middle. Fades out (0.62s, cubic-bezier(.65,0,.35,1)) once loaded.
 */
export function Preloader() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const linesRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const start = performance.now();
    let loaded = false;
    let doneTimer = 0;
    const tick = window.setInterval(() => {
      const [a, b] = linesRef.current;
      if (a) a.textContent = scramble("ODAM", 0);
      if (b) b.textContent = scramble("DAM::OM", 0);
    }, 90);
    const finish = () => {
      if (loaded) return;
      loaded = true;
      const wait = Math.max(0, MIN_MS - (performance.now() - start));
      doneTimer = window.setTimeout(() => {
        window.clearInterval(tick);
        setLeaving(true);
        emitBootDone();
        window.setTimeout(() => setGone(true), 700);
      }, wait);
    };
    const onProgress = (e: Event) => {
      if ((e as CustomEvent<number>).detail >= 1) finish();
    };
    window.addEventListener(BOOT_PROGRESS, onProgress);
    // Never hold the page hostage: give up waiting for WebGL after 9s.
    const failsafe = window.setTimeout(finish, 9000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(doneTimer);
      window.clearTimeout(failsafe);
      window.removeEventListener(BOOT_PROGRESS, onProgress);
    };
  }, []);

  if (gone) return null;
  return (
    <div
      role="status"
      aria-label="Loading"
      className="pointer-events-none fixed inset-0 z-[70] grid place-items-center transition-[opacity,visibility] duration-[620ms] ease-[cubic-bezier(0.65,0,0.35,1)]"
      style={{
        background: "linear-gradient(180deg,#fdfdfd 0%,#f8f8f8 30%,#eeeeee 66%,#e2e2e2 100%)",
        opacity: leaving ? 0 : 1,
        visibility: leaving ? "hidden" : "visible",
      }}
    >
      <p aria-hidden="true" className="text-center text-xs leading-[1.15] text-ink/80">
        <span
          ref={(el) => {
            linesRef.current[0] = el;
          }}
          className="block whitespace-pre"
        >
          :\/A
        </span>
        <span
          ref={(el) => {
            linesRef.current[1] = el;
          }}
          className="block whitespace-pre"
        >
          DAM::OM
        </span>
      </p>
    </div>
  );
}
