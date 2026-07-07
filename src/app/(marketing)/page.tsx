import Image from "next/image"
import FAQ from "@/components/marketing/faq"
import FinalCTAGrid from "@/components/marketing/final-cta-grid"
import Hero from "@/components/marketing/hero"
import PricingSection from "@/components/marketing/pricing-section"
import RolesGrid from "@/components/marketing/roles-grid"
import TabbedBenefits from "@/components/marketing/tabbed-benefits"
import TourTabs from "@/components/marketing/tour-tabs"
import TrustStrip from "@/components/marketing/trust-strip"

export default function LandingPage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      
      <section className="relative mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="relative overflow-hidden rounded-2xl md:rounded-[2rem] border border-border/50 bg-muted/20 shadow-2xl">
          <Image
            src="/marketing/hero-dashboard2.jpg"
            alt="QMS-MANAJA dashboard overview"
            width={2400}
            height={1400}
            className="w-full h-auto object-cover"
            priority
          />
        </div>
      </section>

      <TabbedBenefits />
      <TourTabs />
      <RolesGrid />
      <PricingSection />
      <FAQ />
      <FinalCTAGrid />
    </>
  )
}
