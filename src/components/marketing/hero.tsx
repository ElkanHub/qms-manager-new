import Link from "next/link";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";
import SectionGrainient from "@/components/marketing/section-grainient";
import MetallicPaint from "@/components/ui/metallic-paint";

export default function Hero() {
  return (
    <section className="relative isolate flex min-h-dvh items-center overflow-hidden bg-brand-navy">
      <SectionGrainient preset="hero" />

      <div className="relative mx-auto w-full max-w-7xl px-6 pt-32 pb-20 sm:pt-36 sm:pb-24 lg:px-8 lg:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="max-w-xl">
          <h1 className="mt-8 font-serif text-5xl font-medium tracking-tight text-white sm:text-7xl">
            Your procedures, in&nbsp;order.
          </h1>

          <p className="mt-8 max-w-lg text-lg text-white/70">
            Manage SOPs, approvals, equipment PMs, and training in one
            controlled system. Real-time Pulse surfaces what needs attention
            next. Built for QA-led teams.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/contact"
              className="group inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-brand-navy shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] transition-all hover:bg-white/90 active:translate-y-px"
            >
              Get started
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-6 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:border-white/50 hover:bg-white/10"
            >
              <Calendar className="size-4" />
              Book a demo
            </Link>
            <Link
              href="/signin"
              className="inline-flex h-12 items-center px-2 text-sm font-medium text-white/75 transition-colors hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Right Side: Metallic Paint Component */}
        <div className="relative w-full aspect-square max-w-lg mx-auto lg:mx-0">
          <MetallicPaint
            imageSrc="/marketing/logo.jpg"
            mouseAnimation={true}
            speed={0.25}
            refraction={0.015}
            blur={0.02}
            brightness={2.2}
            contrast={0.8}
            liquid={0.8}
            lightColor="#2DD4BF" // brand teal highlight
            darkColor="#0f172a" // brand navy dark parts
            tintColor="#38BDF8" // brand sky tint
          />
        </div>
      </div>
    </section>
  );
}
