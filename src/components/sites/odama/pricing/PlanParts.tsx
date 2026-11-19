import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { PRICE_CLASS, TONES, splitWords, type Plan } from "./data";

/** Word spans the pinned stage streams in and out ([data-pw]). */
export function Words({ text }: { text: string }) {
  return (
    <>
      {splitWords(text).map((word, i) => (
        <span key={i} data-pw="">
          {word}
        </span>
      ))}
    </>
  );
}

export function ArrowIcon() {
  return (
    <span aria-hidden="true" className="relative z-10 block leading-[0]">
      <span className="pixel-icon">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M6 12H18M14 8L18 12L14 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
        </svg>
      </span>
    </span>
  );
}

const TRANSITION = "background-color, border-color, border-radius, color, opacity, transform";

type SkinStyle = CSSProperties & { "--btn-rest": string; "--btn-lit": string };

/** Pill + round orb call to action used on every plan card. */
export function PlanCta({ plan }: { plan: Plan }) {
  const cream = plan.tone === "cream";
  const style: SkinStyle = {
    transitionProperty: TRANSITION,
    "--btn-rest": cream ? "rgba(0,0,0,0.27)" : "#fff",
    "--btn-lit": cream ? "rgba(0,0,0,0.72)" : "#fff",
  };
  const skin = cn(
    "relative isolate overflow-hidden transition-colors duration-300 bg-[var(--btn-rest)] group-hover/cta:bg-[var(--btn-lit)]",
    cream ? "text-white" : "text-ink",
  );
  const external = plan.href.startsWith("http");
  return (
    <a
      href={plan.href}
      aria-label={plan.cta}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="group/cta inline-flex w-fit items-center gap-1"
    >
      <span
        style={style}
        className={cn(skin, "inline-flex h-9 min-w-36 items-center justify-center whitespace-nowrap rounded-[6px] px-4 text-sm font-medium")}
      >
        <span className="relative z-10">{plan.cta}</span>
      </span>
      <span style={style} className={cn(skin, "inline-flex size-9 flex-none items-center justify-center rounded-[18px]")}>
        <ArrowIcon />
      </span>
    </a>
  );
}

export function SlotsBadge({
  open,
  total,
  streamed = false,
  className,
}: {
  open: number;
  total: number;
  streamed?: boolean;
  className?: string;
}) {
  const pw = streamed ? { "data-pw": "" } : null;
  return (
    <p className={cn("flex items-center gap-2 text-sm", className)}>
      <span>
        <b {...pw} className="font-semibold">
          {open}{" "}
        </b>
        <span {...pw}>of </span>
        <b {...pw} className="font-semibold">
          {total}{" "}
        </b>
        <span {...pw}>slots </span>
        <span {...pw}>open</span>
      </span>
      <span
        aria-hidden="true"
        {...(streamed ? { "data-pr": "" } : null)}
        className="inline-flex h-5 flex-row-reverse items-center gap-1 rounded-full bg-white px-1.5"
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("size-2.5 rounded-full", i < total - open ? "bg-[#1a9b38]" : "bg-[#ff8a8a]")} />
        ))}
      </span>
    </p>
  );
}

/** Card used by the stacked (non-pinned) layout under 1024px wide or 600px tall. */
export function LitePlanCard({ plan }: { plan: Plan }) {
  const tone = TONES[plan.tone];
  return (
    <article className={cn("relative flex flex-col overflow-hidden rounded-chip p-4 lg:min-h-[560px]", tone.card)}>
      <h3 className="text-[2rem] font-medium leading-none tracking-[-0.02em] xl:text-[2.25rem]">{plan.name}</h3>
      <p className={cn("mt-3 text-[1rem] leading-[1.2]", tone.soft)}>{plan.blurb}</p>
      <div className="mt-16 lg:mt-auto lg:pt-16">
        <p aria-hidden={!plan.from} className={cn("text-[1.5rem] leading-none", tone.soft, !plan.from && "invisible")}>
          Start From
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
          <span className={PRICE_CLASS}>{plan.price}</span>
          <span className={cn("text-[1.5rem] leading-none", tone.soft)}>{plan.per}</span>
        </p>
      </div>
      <ul className="mt-10 list-disc pl-4 text-body leading-[1.4] lg:mt-14">
        {plan.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 lg:mt-12">
        <PlanCta plan={plan} />
        {plan.slots && <SlotsBadge {...plan.slots} className="mb-2 self-end" />}
      </div>
    </article>
  );
}

/** Body of a card on the pinned stage: every word is a [data-pw] span so it can be typed in/out. */
export function StagePlanBody({ plan }: { plan: Plan }) {
  const tone = TONES[plan.tone];
  return (
    <div className="flex h-full flex-col px-4 pt-3 pb-4 *:shrink-0">
      <p className={cn("max-w-[22rem] text-[1rem] leading-[1.2]", tone.soft)}>
        <Words text={plan.blurb} />
      </p>
      <div aria-hidden="true" className="min-h-3 flex-1" />
      <div>
        <p aria-hidden={!plan.from} className={cn("text-[1.5rem] leading-none", tone.soft, !plan.from && "invisible")}>
          <Words text="Start From" />
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
          <span data-pw="" className={PRICE_CLASS}>
            {plan.price}
          </span>
          <span className={cn("text-[1.5rem] leading-none", tone.soft)}>
            <Words text={plan.per} />
          </span>
        </p>
      </div>
      <div aria-hidden="true" className="min-h-3 max-h-10 flex-1" />
      <ul className="pl-4 text-body leading-[1.4]">
        {plan.points.map((point) => (
          <li key={point} className="relative">
            <span data-pr="" aria-hidden="true" className="absolute -left-3">
              •
            </span>
            <Words text={point} />
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="min-h-3 max-h-10 flex-1" />
      <div className="flex items-center justify-between gap-4">
        <div data-pr="" data-plan-cta="" className="min-w-0">
          <PlanCta plan={plan} />
        </div>
        {plan.slots && <SlotsBadge {...plan.slots} streamed className="mb-2 shrink-0 self-end whitespace-nowrap" />}
      </div>
    </div>
  );
}
