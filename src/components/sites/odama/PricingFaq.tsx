import { PricingLite } from "./pricing/PricingLite";
import { PricingStage } from "./pricing/PricingStage";

/**
 * Pricing + FAQ. On desktop (min-width 1024px and min-height 600px) a pinned 310vh stage plays
 * the plans-to-FAQ choreography; otherwise the plain stacked layout is shown.
 */
export function PricingFaq() {
  return (
    <section id="pricing" className="relative bg-bg pricing-stage:bg-transparent">
      <div className="pricing-stage:hidden">
        <PricingLite />
      </div>
      <PricingStage />
    </section>
  );
}
