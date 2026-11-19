"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BOOT_PROGRESS, onBootDone } from "./boot";
import { OdamaMark } from "./hero/icons";

const INQUIRY_URL = "https://www.odama.io/inquiry";
const CHIP_BG = { backgroundColor: "rgba(0,0,0,0.55)" };

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75M12 21.25C6.89137 21.25 2.75 17.1086 2.75 12C2.75 6.89137 6.89137 2.75 12 2.75M12 21.25C9.65279 21.25 7.75 17.1086 7.75 12C7.75 6.89137 9.65279 2.75 12 2.75M12 21.25C14.3472 21.25 16.25 17.1086 16.25 12C16.25 6.89137 14.3472 2.75 12 2.75M21 12H3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 7L9.21841 12.0996C9.13497 12.2525 9.27345 12.4316 9.4425 12.3894L14.5396 11.1151C14.7113 11.0722 14.8501 11.257 14.7609 11.4099L11.5 17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.25 9L7.95708 11.2929C7.56655 11.6834 7.56655 12.3166 7.95708 12.7071L10.25 15M13.75 9L16.0429 11.2929C16.4334 11.6834 16.4334 12.3166 16.0429 12.7071L13.75 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Percent sign while booting, morphing into an arrow once the page is ready (as on the source). */
function MorphIcon({ ready }: { ready: boolean }) {
  const base = "absolute left-0 top-0 block transition-all duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]";
  return (
    <span className="relative z-10 block size-4">
      <span
        aria-hidden="true"
        className={`${base} rounded-full border-solid border-current`}
        style={
          ready
            ? { width: "5.743px", height: "1.5px", borderWidth: 0, backgroundColor: "#fff", transform: "translate(8.1285px,5.75px) rotate(45deg)" }
            : { width: "5.5px", height: "5.5px", borderWidth: "1.5px", backgroundColor: "rgba(255,255,255,0)", transform: "translate(0px,0.5px)" }
        }
      />
      <span
        aria-hidden="true"
        className={`${base} rounded-full border-solid border-current`}
        style={
          ready
            ? { width: "5.743px", height: "1.5px", borderWidth: 0, backgroundColor: "#fff", transform: "translate(8.1285px,8.75px) rotate(-45deg)" }
            : { width: "5.5px", height: "5.5px", borderWidth: "1.5px", backgroundColor: "rgba(255,255,255,0)", transform: "translate(10.5px,10px)" }
        }
      />
      <span
        aria-hidden="true"
        className={`${base} bg-current`}
        style={{ width: "16px", height: "1.5px", transform: ready ? "translate(0px,7.25px) scale(0.6563,1)" : "translate(0px,7.25px) rotate(-45deg)" }}
      />
    </span>
  );
}

export function Nav() {
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let shown = 0;
    let target = 0;
    let raf = 0;
    const step = () => {
      shown += (target - shown) * 0.12 + 0.2;
      if (shown > target) shown = target;
      setCount(Math.round(shown));
      if (shown < target) raf = requestAnimationFrame(step);
      else raf = 0;
    };
    const onProgress = (e: Event) => {
      target = Math.max(target, Math.round((e as CustomEvent<number>).detail * 100));
      if (!raf) raf = requestAnimationFrame(step);
    };
    window.addEventListener(BOOT_PROGRESS, onProgress);
    const stop = onBootDone(() => {
      target = 100;
      shown = 100;
      setCount(100);
      setReady(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      stop();
      window.removeEventListener(BOOT_PROGRESS, onProgress);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] overflow-x-clip page-x pt-[max(0.75rem,env(safe-area-inset-top))] transition-transform duration-[900ms] ease-[cubic-bezier(0.3,0,0.2,1)] md:pt-[max(1rem,env(safe-area-inset-top))]"
      style={{ transform: ready ? "none" : "translateY(calc(100dvh - 64px))" }}
    >
      <nav className="flex items-start justify-between">
        <Link
          href="/"
          aria-label="Odama, home"
          style={CHIP_BG}
          className="glass-chip pointer-events-auto relative isolate flex h-10 items-center gap-2 overflow-hidden pr-3 pl-2.5 text-sm font-medium transition-[background-color] duration-300 hover:!bg-black/70 max-md:w-10 max-md:justify-center max-md:rounded-full max-md:px-0"
        >
          <span className="relative z-10 flex items-center">
            <OdamaMark />
          </span>
          <span className="relative z-10 max-md:hidden">Odama</span>
        </Link>

        <div
          data-mode-switch=""
          aria-label="Site mode"
          className={`pointer-events-auto absolute left-1/2 flex h-10 -translate-x-1/2 items-center gap-1 rounded-[20px] p-1 text-white transition-[translate,opacity,visibility] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${ready ? "visible opacity-100" : "invisible -translate-y-[160%] opacity-0"}`}
        >
          <span aria-hidden="true" className="glass-blur glass-chip absolute inset-0 rounded-[20px]" />
          <button
            type="button"
            aria-current="true"
            aria-label="Full experience"
            data-tip="full"
            className="relative isolate grid size-8 cursor-default place-items-center overflow-hidden rounded-full bg-white text-black/55 transition-colors duration-200"
          >
            <span className="pixel-icon">
              <GlobeIcon />
            </span>
          </button>
          <a
            href="https://www.odama.io/"
            aria-label="Quick mode"
            data-tip="lite"
            className="relative isolate grid size-8 place-items-center overflow-hidden rounded-full text-white transition-colors duration-200 hover:bg-white/20"
          >
            <span className="pixel-icon">
              <BoltIcon />
            </span>
          </a>
          <a
            href="https://www.odama.io/machine"
            aria-label="Machine mode"
            data-tip="machine"
            className="relative isolate grid size-8 place-items-center overflow-hidden rounded-full text-white transition-colors duration-200 hover:bg-white/20"
          >
            <span className="pixel-icon">
              <CodeIcon />
            </span>
          </a>
          <span aria-hidden="true" className="mode-tip">
            <span className="mode-tip-o" data-tip-for="any">
              <span className="mode-tip-i glass-blur glass-chip grid rounded-[14px] px-3 py-1.5 text-xs leading-4 font-medium whitespace-nowrap">
                {(
                  [
                    ["full", "Full experience"],
                    ["lite", "Quick mode"],
                    ["machine", "Machine mode"],
                  ] as const
                ).map(([key, label]) => (
                  <span key={key} className="mode-tip-o col-start-1 row-start-1 text-center" data-tip-for={key}>
                    <span className="mode-tip-i block">{label}</span>
                  </span>
                ))}
              </span>
            </span>
          </span>
        </div>

        <div className="relative flex flex-col items-end gap-1.5">
          <div className="flex origin-right items-center gap-1.5">
            <a
              href={INQUIRY_URL}
              aria-disabled={!ready}
              tabIndex={ready ? 0 : -1}
              style={CHIP_BG}
              className={`glass-chip relative isolate flex h-10 origin-right items-center justify-start overflow-hidden px-3 text-sm font-medium tabular-nums transition-[background-color] duration-300 hover:!bg-black/70 max-md:sr-only ${ready ? "pointer-events-auto" : "pointer-events-none"}`}
            >
              <span className="relative z-10 block whitespace-nowrap">{ready ? "Let’s Talk!" : count}</span>
            </a>
            <a
              href={INQUIRY_URL}
              aria-hidden="true"
              tabIndex={-1}
              style={CHIP_BG}
              className={`glass-chip relative isolate grid size-10 place-items-center overflow-hidden rounded-[20px] transition-[background-color,border-radius] duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] hover:!bg-black/70 max-md:hidden ${ready ? "pointer-events-auto" : "pointer-events-none"}`}
            >
              <MorphIcon ready={ready} />
            </a>
            <a href={INQUIRY_URL} aria-label="Send an inquiry" className="glass-chip pointer-events-auto grid size-10 place-items-center rounded-[20px] md:hidden">
              <span className="pixel-icon text-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img width={22} height={22} alt="" src="/sites/odama/lite/nav/email.svg" />
              </span>
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}
