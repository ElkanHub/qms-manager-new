export default function TrustStrip() {
  return (
    <section className="border-y border-border/60 bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 text-center md:flex-row md:text-left lg:px-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Trusted by quality-led teams
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-medium text-muted-foreground/80">
          <span>Pharmaceutical</span>
          <span className="hidden size-1 rounded-full bg-muted-foreground/40 md:inline-block" />
          <span>Biotech</span>
          <span className="hidden size-1 rounded-full bg-muted-foreground/40 md:inline-block" />
          <span>Food &amp; Beverage</span>
          <span className="hidden size-1 rounded-full bg-muted-foreground/40 md:inline-block" />
          <span>Medical Devices</span>
          <span className="hidden size-1 rounded-full bg-muted-foreground/40 md:inline-block" />
          <span>Cosmetics</span>
        </div>
      </div>
    </section>
  )
}
