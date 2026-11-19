/** Pricing plans and FAQ copy, as shipped on odama.io (Full experience). */

export type PlanTone = "cream" | "flame" | "ink";

export interface Plan {
  id: string;
  tone: PlanTone;
  name: string;
  blurb: string;
  /** Shows the "Start From" line (kept invisible otherwise so the rows line up). */
  from: boolean;
  price: string;
  per: string;
  points: string[];
  cta: string;
  href: string;
  slots?: { open: number; total: number };
}

/** Real destinations: checkout, packages and inquiry live on the source site. */
const SOURCE = "https://www.odama.io";

export const PLANS: Plan[] = [
  {
    id: "fixed-scope",
    tone: "cream",
    name: "Small Builds",
    blurb: "One thing that has to ship. Pay once.",
    from: true,
    price: "$500",
    per: "/one-time",
    points: [
      "Landing page, pitch deck, logo, or motion piece",
      "Fixed scope and a delivery date, agreed upfront",
      "Two revision rounds included",
    ],
    cta: "See Packages",
    href: `${SOURCE}/#pricing`,
  },
  {
    id: "subscription",
    tone: "flame",
    name: "Embedded",
    blurb: "A design team inside yours, without the hiring.",
    from: false,
    price: "$3,499",
    per: "/mo",
    points: [
      "One request at a time, queue as many as you like",
      "2-3 business day turnaround",
      "Pause & resume with notice, cancel anytime",
    ],
    cta: "Subscribe Now",
    href: `${SOURCE}/#pricing`,
    slots: { open: 2, total: 3 },
  },
  {
    id: "project",
    tone: "ink",
    name: "Big Builds",
    blurb: "A full product, brand, or site, from scope to launch.",
    from: true,
    price: "$9,999",
    per: "/one-time",
    points: [
      "Strategy, design, and build, not just Figma files",
      "One team from kickoff to launch",
      "30 days of fixes after launch",
    ],
    cta: "Get a Scope",
    href: `${SOURCE}/inquiry`,
  },
];

export const TONES: Record<PlanTone, { card: string; soft: string }> = {
  cream: { card: "bg-surface text-ink", soft: "text-[#999]" },
  flame: { card: "bg-flame text-white", soft: "text-white/70" },
  ink: { card: "bg-ink text-white", soft: "text-white/60" },
};

export const PRICE_CLASS = "text-[clamp(3rem,5.2vw,4.5rem)] font-medium leading-none tracking-[-0.04em]";

export const PRICING_LABEL = "Pricings";
export const PRICING_LEAD = "Choose how you want to work with us, and everything you need to know first";

export interface FaqEntry {
  id: string;
  q: string;
  a: string;
}

export const FAQ_EMAIL = "hellodama@odama.io";

export const FAQ_ITEMS: FaqEntry[] = [
  {
    id: "plan",
    q: "Which plan fits me, and what will I actually pay?",
    a: "Depends on what you’re building. One thing that needs to ship, like a landing page or a pitch deck? Small Builds, from $500. Want a design team on your side every working day? Embedded, $3,499/mo. Starting something big from scratch, like a brand, a product, or a whole site? Big Builds, from $9,999.\n\nSmall Builds and Big Builds “start at” because the price follows the scope. We hop on a quick call, agree on scope, price, and deadline, and that’s the number you pay. No hourly billing, no surprise invoices.",
  },
  {
    id: "trial",
    q: "Can I try Embedded first? What about refunds?",
    a: "Yes! Your first week is a test drive. Send up to 2 requests (no full websites, motion, or 3D yet) and see how we work. Not feeling it? Tell us before day 7 ends and we’ll refund 75%. The work from that week stays with us if you take the refund. First-time clients only.\n\nAfter the trial, every month is paid upfront, so we can’t refund once it’s running.",
  },
  {
    id: "subscription",
    q: "How does Embedded actually work?",
    a: `You pay $3,499 upfront each month and a design team is on call for you. Add as many requests as you like, we take them one at a time and each usually comes back in 2-3 business days. If next month isn’t paid, we simply stop there. Want to upgrade or downgrade? Email ${FAQ_EMAIL} and we’ll sort it out together (the base plan is as low as it goes).`,
  },
  {
    id: "pause",
    q: "How does pausing work?",
    a: "Give us 3 business days’ notice. We wrap up what’s in progress, then hit pause. Your cycle is 31 days, so pausing on day 11 saves 20 days for later. You can pause for up to 30 days and we keep your slot warm. Not back by then? The saved days expire and your slot opens up for someone else. To unpause, same 3 days’ notice so we can line up your designer. Pausing isn’t available during the trial week.",
  },
  {
    id: "cancel",
    q: "What happens if I cancel?",
    a: `Just email ${FAQ_EMAIL}. We hand over everything we’re working on, as is, nothing gets thrown away. Days left in your cycle won’t carry over, including saved days from a pause. If you just need a breather, pausing is probably the better pick.`,
  },
  {
    id: "team",
    q: "Who am I working with, and do I own the files?",
    a: "The Odama team! We’re a design studio in Indonesia and we’ve been shipping work for 5+ years. You get one PM as your main contact, and the rest of the studio (UI/UX, branding, motion, 3D, and developers for Shopify, Framer, Webflow, or custom code) jumps in whenever the project needs them. Once it’s paid, everything is yours: source files, exports, Figma files. No licensing stuff.",
  },
];

/**
 * Stand-in for the source's AI answer endpoint (/api/ask), which this clone does not have.
 * Every question gets this fixed reply, streamed in word by word.
 */
export const FAQ_STANDIN_REPLY = `We can’t answer new questions live on this page yet. The answers above cover plans, pricing, the trial week, pausing, cancelling and file ownership. For anything else, email ${FAQ_EMAIL} and the team will get back to you.`;

/** Splits text into words that keep their trailing whitespace, like the source's /\S+\s*\/g. */
export function splitWords(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}
