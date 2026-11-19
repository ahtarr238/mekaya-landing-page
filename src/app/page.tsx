import { SmoothScroll } from "@/components/sites/odama/SmoothScroll";
import { Preloader } from "@/components/sites/odama/Preloader";
import { Nav } from "@/components/sites/odama/Nav";
import { Hero } from "@/components/sites/odama/Hero";
import { MobileReel } from "@/components/sites/odama/hero/MobileReel";
import { About } from "@/components/sites/odama/About";
import { Why } from "@/components/sites/odama/Why";
import { Works } from "@/components/sites/odama/Works";
import { Services } from "@/components/sites/odama/Services";
import { Testimonials } from "@/components/sites/odama/Testimonials";
import { PricingFaq } from "@/components/sites/odama/PricingFaq";
import { Contact } from "@/components/sites/odama/Contact";
import { Footer } from "@/components/sites/odama/Footer";
import { CookieBanner } from "@/components/sites/odama/CookieBanner";
import { MetalCursor } from "@/components/sites/odama/MetalCursor";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Preloader />
      <Nav />
      <main>
        <Hero />
        {/* As on the source, everything after the hero rides up over its last screen. */}
        <div className="relative z-10 bg-bg md:-mt-[100lvh]">
          <MobileReel />
          <About />
          <Why />
          <Works />
          <Services />
          <Testimonials />
          <PricingFaq />
          <Contact />
          <Footer />
        </div>
      </main>
      <CookieBanner />
      <MetalCursor />
    </>
  );
}
