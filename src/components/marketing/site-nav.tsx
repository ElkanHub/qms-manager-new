import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Logo } from "@/components/ui/logo"

export default function SiteNav() {
  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:top-5 sm:px-6">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border border-white/10 bg-brand-navy/70 pr-2 pl-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.45)] backdrop-blur-xl backdrop-saturate-150 sm:h-16 sm:pl-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo forceDark />
          <span className="text-[15px] font-semibold tracking-tight text-white">QMS-MANAJA</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <a href="#features" className="text-sm font-medium text-white/70 transition-colors hover:text-white">
            Features
          </a>
          <a href="#tour" className="text-sm font-medium text-white/70 transition-colors hover:text-white">
            Tour
          </a>
          <a href="#pricing" className="text-sm font-medium text-white/70 transition-colors hover:text-white">
            Pricing
          </a>
          <a href="#faq" className="text-sm font-medium text-white/70 transition-colors hover:text-white">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/signin"
            className="hidden h-10 items-center px-3 text-sm font-medium text-white/70 transition-colors hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-brand-navy shadow-sm transition-all hover:bg-white/90 active:translate-y-px"
          >
            Get started
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
