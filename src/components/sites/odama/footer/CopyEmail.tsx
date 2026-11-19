"use client";

import { useEffect, useState, type ReactNode } from "react";

const COPIED = "Email copied to clipboard";
const FAILED = "Couldn’t copy — select the address instead";

function legacyCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** "Contact / E: …" — click to copy; the label swaps through hover / copied / failed states. */
export function CopyEmail({ email, label = "Contact" }: { email: string; label?: string }) {
  const [hover, setHover] = useState(false);
  const [result, setResult] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), 1600);
    return () => window.clearTimeout(t);
  }, [result]);

  const copy = async () => {
    if (window.getSelection()?.toString()) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(email);
      ok = true;
    } catch {
      ok = legacyCopy(email);
    }
    setResult(ok ? "copied" : "failed");
  };

  const state = result ?? (hover ? "hover" : "rest");
  const labels: Array<[string, ReactNode]> = [
    ["rest", label],
    ["hover", "Copy email"],
    [
      "copied",
      <>
        <svg
          viewBox="0 0 16 16"
          className="mr-1.5 size-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5l3.2 3.2L13 4.8" />
        </svg>
        {COPIED}
      </>,
    ],
    ["failed", FAILED],
  ];

  return (
    <>
      <p aria-hidden="true" className="u-label">
        <span className="odama-text-swap whitespace-nowrap">
          {labels.map(([key, node]) => (
            <span key={key} className="odama-text-swap-o" data-on={state === key ? "" : undefined}>
              <span className="odama-text-swap-i">{node}</span>
            </span>
          ))}
        </span>
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {result === "copied" ? COPIED : result === "failed" ? FAILED : ""}
      </span>
      <p className="mt-1 text-h3">
        <span
          role="button"
          tabIndex={0}
          aria-label={`${label} — copy E: ${email}`}
          onClick={copy}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void copy();
            }
          }}
          className={`cursor-copy select-text whitespace-nowrap transition-colors duration-300 hover:text-flame ${
            result === "copied" ? "text-flame" : ""
          }`}
        >
          E: {email}
        </span>
      </p>
      <style>{`
        .odama-text-swap { --swap-t: .42s; --swap-ease: cubic-bezier(.16, 1, .3, 1); display: inline-grid; }
        .odama-text-swap-o { grid-area: 1 / 1; display: block; translate: 0 -12px; transition: translate 0s linear var(--swap-t); }
        .odama-text-swap-i {
          display: flex; align-items: center; opacity: 0; filter: blur(3px); translate: 0 6px;
          transition: opacity calc(var(--swap-t) * .7) ease-out, translate var(--swap-t) var(--swap-ease), filter var(--swap-t) var(--swap-ease);
        }
        .odama-text-swap-o[data-on] { translate: 0; transition: translate var(--swap-t) var(--swap-ease); }
        .odama-text-swap-o[data-on] > .odama-text-swap-i { opacity: 1; filter: none; translate: 0; }
        @media (prefers-reduced-motion: reduce) { .odama-text-swap { --swap-t: 1ms; } }
      `}</style>
    </>
  );
}
