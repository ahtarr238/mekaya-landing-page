"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FAQ_ITEMS, FAQ_STANDIN_REPLY, splitWords } from "./data";
import { ArrowIcon } from "./PlanParts";

type AskStatus = "thinking" | "streaming" | "done";

interface Asked {
  question: string;
  text: string;
  status: AskStatus;
}

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

function FaqLine({ focus = false }: { focus?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-faq-line="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-[#dcdcdc] transition-colors",
        focus && "group-focus-within/ask:bg-ink",
      )}
    />
  );
}

function FaqRow({
  q,
  open,
  onToggle,
  children,
}: {
  q: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <FaqLine />
      <button
        data-faq-row="true"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-4 rounded-[6px] px-3 py-4 text-left text-[1.125rem] leading-[1.3] tracking-[-0.01em] transition-colors duration-200 md:text-[1.25rem]",
          open ? "text-ink" : "text-[#8c8c8c] hover:bg-surface hover:text-ink",
        )}
      >
        <span className="block min-h-[1.3em]">
          {splitWords(q).map((word, i) => (
            <span key={i} data-faq-word="true" className="faq-word [animation-duration:0.25s]">
              {word}
            </span>
          ))}
          <span aria-hidden="true" data-faq-caret="true" hidden className="faq-caret" />
        </span>
        <span data-faq-chev="true" className="flex-none">
          <span
            className={cn(
              "pixel-icon size-6 flex-none text-ink transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              open && "rotate-180",
            )}
          >
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M8 10L12 14L16 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </li>
  );
}

function ThinkingDots() {
  return (
    <span role="status" aria-label="Thinking" className="mt-3 inline-flex items-center gap-1.5 py-2">
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ animationDelay: `${160 * i}ms` }} className="faq-dot size-2 rounded-full bg-flame" />
      ))}
    </span>
  );
}

function StreamedAnswer({ text, done }: { text: string; done: boolean }) {
  return (
    <p className="mt-3 text-body leading-[1.35] tracking-normal text-[#8c8c8c]">
      {splitWords(text).map((word, i) => (
        <span key={i} className="faq-word">
          {word}
        </span>
      ))}
      {!done && <span aria-hidden="true" className="faq-caret" />}
    </p>
  );
}

/**
 * FAQ accordion (one answer open at a time, all closed at first) plus the "ask your own
 * question" field. The source streams an AI answer from /api/ask; this clone has no backend,
 * so a fixed stand-in reply is streamed instead (see FAQ_STANDIN_REPLY).
 */
export function FaqList({ fieldId = "faq-ask-desktop" }: { fieldId?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [draft, setDraft] = useState("");
  const timers = useRef<number[]>([]);
  const isMobile = useIsMobile();

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  const ask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    clearTimers();
    setActive(null);
    setAsked({ question, text: "", status: "thinking" });
    const words = splitWords(FAQ_STANDIN_REPLY);
    const start = 700;
    words.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setAsked((prev) => prev && { ...prev, text: words.slice(0, i + 1).join(""), status: "streaming" });
        }, start + i * 38),
      );
    });
    timers.current.push(
      window.setTimeout(() => setAsked((prev) => prev && { ...prev, status: "done" }), start + words.length * 38 + 60),
    );
  };

  const trimmed = draft.trim();

  return (
    <div>
      <ul>
        {FAQ_ITEMS.map((item, i) => (
          <FaqRow key={item.id} q={item.q} open={active === i} onToggle={() => setActive(active === i ? null : i)}>
            <p
              data-faq-fade="true"
              className="max-w-[520px] whitespace-pre-line px-3 pb-5 text-body leading-[1.35] text-[#8c8c8c]"
            >
              {item.a}
            </p>
          </FaqRow>
        ))}
      </ul>
      <form onSubmit={ask} className="group/ask relative">
        <FaqLine focus />
        <label htmlFor={fieldId} className="sr-only">
          Ask your own question
        </label>
        <div className="flex items-center gap-3 px-3 py-3">
          <input
            data-faq-field="true"
            id={fieldId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraft("");
            }}
            maxLength={500}
            autoComplete="off"
            placeholder={isMobile ? "Type your question..." : "Type your question and get an instant answer..."}
            className="min-w-0 flex-1 bg-transparent text-[1.125rem] leading-[1.3] tracking-[-0.01em] text-ink outline-none placeholder:text-[#8c8c8c] md:text-[1.25rem]"
          />
          <span data-faq-send="true" className="inline-flex">
            <span className={cn("transition-opacity duration-200", !trimmed && "opacity-40")}>
              <button type="submit" disabled={!trimmed} aria-label="Ask" className="group/cta inline-flex w-fit items-center gap-1">
                <span className="relative isolate inline-flex size-10 flex-none items-center justify-center overflow-hidden rounded-[20px] bg-ink text-white transition-colors duration-300">
                  <ArrowIcon />
                </span>
              </button>
            </span>
          </span>
        </div>
        <div
          aria-live="polite"
          className={cn(
            "grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            asked ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {asked && (
              <div data-faq-fade="true" className="max-w-[520px] px-3 pb-5">
                <div
                  className={cn(
                    "transition-opacity duration-300",
                    asked.status === "done" && trimmed !== asked.question && "opacity-35",
                  )}
                >
                  {asked.status === "thinking" ? (
                    <ThinkingDots />
                  ) : (
                    <StreamedAnswer key={asked.question} text={asked.text} done={asked.status === "done"} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
