"use client";

import { useEffect, useState } from "react";
import { onBootDone } from "./boot";

const STORAGE_KEY = "odama-cookie-choice";

function CookieIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 12C2 6.47715 6.47715 2 12 2C12.3898 2 12.7747 2.02234 13.1534 2.06587C13.3617 2.08982 13.5505 2.19986 13.674 2.36932C13.7974 2.53878 13.8443 2.75219 13.8033 2.9578C13.7684 3.13249 13.75 3.31372 13.75 3.5C13.75 4.89326 14.7868 6.04558 16.1307 6.2255C16.4659 6.27038 16.7296 6.5341 16.7745 6.86934C16.9544 8.2132 18.1067 9.25 19.5 9.25C19.91 9.25 20.2972 9.16075 20.6448 9.00133C20.8467 8.90874 21.0792 8.91039 21.2797 9.00583C21.4803 9.10127 21.6282 9.28068 21.6837 9.49574C21.8903 10.2969 22 11.1362 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 16.6944 7.30558 20.5 12 20.5C16.6944 20.5 20.5 16.6944 20.5 12C20.5 11.5421 20.4639 11.0931 20.3944 10.6556C20.1057 10.7175 19.8064 10.75 19.5 10.75C17.5347 10.75 15.8818 9.41656 15.3952 7.60481C13.5845 7.11852 12.2516 5.46736 12.25 3.5036C12.167 3.50121 12.0836 3.5 12 3.5Z"
        fill="currentColor"
      />
      <path d="M10 8.5C10 9.32843 9.32843 10 8.5 10C7.67157 10 7 9.32843 7 8.5C7 7.67157 7.67157 7 8.5 7C9.32843 7 10 7.67157 10 8.5Z" fill="currentColor" />
      <path d="M14 11.5C14 12.3284 13.3284 13 12.5 13C11.6716 13 11 12.3284 11 11.5C11 10.6716 11.6716 10 12.5 10C13.3284 10 14 10.6716 14 11.5Z" fill="currentColor" />
      <path d="M18 14C18 14.5523 17.5523 15 17 15C16.4477 15 16 14.5523 16 14C16 13.4477 16.4477 13 17 13C17.5523 13 18 13.4477 18 14Z" fill="currentColor" />
      <path d="M13 16.5C13 17.3284 12.3284 18 11.5 18C10.6716 18 10 17.3284 10 16.5C10 15.6716 10.6716 15 11.5 15C12.3284 15 13 15.6716 13 16.5Z" fill="currentColor" />
      <path d="M8 14C8 14.5523 7.55228 15 7 15C6.44772 15 6 14.5523 6 14C6 13.4477 6.44772 13 7 13C7.55228 13 8 13.4477 8 14Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Cookie notice from the source. The clone sets no analytics cookies, so both buttons only
 * record the visitor's choice locally and dismiss the card.
 */
export function CookieBanner() {
  const [state, setState] = useState<"hidden" | "shown" | "away">("hidden");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored) return;
    return onBootDone(() => window.setTimeout(() => setState("shown"), 900));
  }, []);

  const choose = (choice: "all" | "essential") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Storage can be unavailable (private mode); dismissing still works.
    }
    setState("away");
  };

  if (state === "hidden") return null;
  return (
    <section
      aria-label="Cookies"
      data-cookie-card=""
      data-away={state === "away" ? "" : undefined}
      className="fixed right-0 bottom-0 z-[60] w-full max-w-[460px] p-[var(--gutter)] pb-[calc(var(--gutter)+env(safe-area-inset-bottom))] animate-[faq-rise-in_0.5s_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      <div className="rounded-card bg-ink p-4 text-white shadow-[0_24px_70px_-12px_rgba(0,0,0,0.55)] md:p-6">
        <div className="flex items-start justify-between gap-4 max-md:sr-only">
          <h2 className="text-[1.625rem] leading-none font-normal tracking-[-0.025em] md:text-h1">Cookies!</h2>
          <span className="pixel-icon mt-0.5 flex-none text-white">
            <CookieIcon />
          </span>
        </div>
        <p className="mt-2 text-sm leading-snug text-white/70 max-md:mt-0 max-md:text-[13px] md:max-w-[38ch]">
          <span aria-hidden="true" className="font-medium text-white md:hidden">
            Cookies!{" "}
          </span>
          We use essential cookies to run the site and, if you allow it, analytics cookies to see which pages get read. See our{" "}
          <a className="text-white underline underline-offset-2" href="https://www.odama.io/privacy-policy">
            Privacy Policy
          </a>
          .
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 md:mt-5">
          <button type="button" onClick={() => choose("all")} className="btn-base h-11 w-full bg-white px-5 text-sm text-ink hover:bg-white/85 md:h-12">
            Accept All
          </button>
          <button type="button" onClick={() => choose("essential")} className="btn-base h-11 w-full bg-[#262626] px-5 text-sm text-white hover:bg-[#333] md:h-12">
            Manage Cookies
          </button>
        </div>
      </div>
    </section>
  );
}
