import type { Metadata } from "next"

import SiteFooter from "@/components/marketing/site-footer"
import SiteNav from "@/components/marketing/site-nav"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://QMS-MANAJA.app"
const title = "QMS-MANAJA — Procedures in order. Audit ready."
const description =
  "Manage SOPs, approvals, equipment PMs, and training in one controlled system. Real-time Pulse surfaces what needs attention next. Built for QA-led teams."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "QMS-MANAJA",
    url: "/",
    title,
    description,
    images: [{ url: "/marketing/hero-dashboard.webp", width: 2000, height: 1180 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/marketing/hero-dashboard.webp"],
  },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-light min-h-dvh bg-background text-foreground">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  )
}
