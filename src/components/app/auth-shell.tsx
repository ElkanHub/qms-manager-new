import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import SectionGrainient from "@/components/marketing/section-grainient";

// Auth split-screen shell — mirrors the marketing design language so the jump
// from the landing page into the app feels continuous. Left: brand mark + the
// page's form. Right (lg+): a navy hero panel echoing the marketing hero.
// Presentational only — pages own all auth logic.
export function AuthShell({
  headline,
  children,
}: {
  headline: { title: string; body: string };
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left — brand + form */}
      <div className="relative flex flex-col gap-8 overflow-hidden p-6 md:p-10">
        {/* Frozen, lazy-mounted grainient — a whisper of the marketing texture,
            kept faint so the form stays crisp in both light and dark. */}
        <SectionGrainient preset="splash" opacity={0.1} />
        <div className="relative z-10 flex justify-center md:justify-start">
          <Link href="/" className="flex items-center gap-2" aria-label="QMS-MANAJA home">
            <Logo />
            <span className="font-semibold tracking-tight">QMS-MANAJA</span>
          </Link>
        </div>
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      {/* Right — navy hero panel (desktop only). No `priority`: display:none on
          mobile means it never downloads there, and it's in-viewport on desktop
          so it loads promptly anyway. */}
      <div className="relative hidden items-center justify-center overflow-hidden p-12 lg:flex">
        <Image src="/auth-img.webp" alt="" fill sizes="50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-navy/95 via-brand-navy/80 to-brand-navy/40" />
        <div className="relative max-w-md text-white">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">{headline.title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-white/80">{headline.body}</p>
        </div>
      </div>
    </div>
  );
}
