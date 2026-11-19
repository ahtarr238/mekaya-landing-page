import { PLANS, PRICING_LABEL, PRICING_LEAD } from "./data";
import { FaqList } from "./FaqList";
import { LitePlanCard } from "./PlanParts";

/** Non-pinned layout (below 1024px wide or 600px tall): plan cards, then the FAQ list. */
export function PricingLite() {
  return (
    <>
      <section className="relative bg-bg section-y">
        <div className="page-x">
          <div className="grid gap-x-2 gap-y-3 md:grid-cols-12">
            <p className="u-label md:col-span-6">{PRICING_LABEL}</p>
            <h2 className="text-h2 font-medium leading-none tracking-[-0.01em] text-pretty md:col-span-4 md:col-start-7 md:text-h3">
              {PRICING_LEAD}
            </h2>
          </div>
        </div>
        <div className="page-x">
          <div className="mt-10 grid gap-2 md:mt-20 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <LitePlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      </section>
      <section id="faq" aria-labelledby="faq-title" className="relative bg-bg section-y">
        <div className="page-x">
          <p id="faq-title" className="u-label">
            FAQ
          </p>
          <div className="mt-6">
            <FaqList fieldId="faq-ask" />
          </div>
        </div>
      </section>
    </>
  );
}
