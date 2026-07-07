"use client"

import dynamic from "next/dynamic"

/**
 * Lazy-load the WebGL Grainient so it never runs during SSR.
 * The canvas is absolutely-positioned behind section content.
 */
const Grainient = dynamic(() => import("@/components/ui/grainient"), {
  ssr: false,
})

/* ──────────────────────────────────────────────────────────────────
   Brand colour palette — used to build harmonious section presets.
   brand-navy  #0F172A
   brand-blue  #0284C7
   brand-teal  #0D9488
   primary     #00C2A8  (dark-mode teal)
   ────────────────────────────────────────────────────────────────── */

/**
 * Section-specific tuning presets. Values are calibrated to match the
 * authentic react-bits Grainient demo — visible grain noise, soft
 * swirling motion, saturated brand colours. Each preset varies the
 * mood but keeps the signature grainy-gradient texture prominent.
 */
export const GRAINIENT_PRESETS = {
  /** Hero — deep, immersive dark canvas. The grain and colour swirl
   *  sit behind the hero image overlay, adding cinematic depth. */
  hero: {
    color1: "#0f172a",
    color2: "#0284c7",
    color3: "#0d9488",
    timeSpeed: 0.25,
    warpFrequency: 5.0,
    warpSpeed: 2.0,
    warpAmplitude: 50.0,
    warpStrength: 1.3,
    rotationAmount: 500.0,
    noiseScale: 2.0,
    grainAmount: 0.1,
    grainScale: 2.0,
    grainAnimated: false,
    contrast: 1.5,
    saturation: 0.7,
    gamma: 1.0,
    zoom: 1.0,
    blendSoftness: 0.05,
    blendAngle: 0.0,
    colorBalance: -0.04,
  },

  /** Splash / Offline — same rich colors as hero, but completely frozen
   *  (no animation, no warping speed) to act as a static backdrop. */
  splash: {
    color1: "#0f172a",
    color2: "#0284c7",
    color3: "#0d9488",
    timeSpeed: 0.0, // Frozen
    warpFrequency: 5.0,
    warpSpeed: 0.0, // Frozen
    warpAmplitude: 50.0,
    warpStrength: 1.3,
    rotationAmount: 500.0,
    noiseScale: 2.0,
    grainAmount: 0.1,
    grainScale: 2.0,
    grainAnimated: false,
    contrast: 1.5,
    saturation: 0.7,
    gamma: 1.0,
    zoom: 1.0,
    blendSoftness: 0.05,
    blendAngle: 0.0,
    colorBalance: -0.04,
  },

  /** Features / Tabbed-benefits — visible blue-teal wash with clear
   *  grain texture. Reads as a living, textured surface. */
  features: {
    color1: "#606063",
    color2: "#a6a4a4",
    color3: "#5d7c79",
    timeSpeed: 0.0,
    warpFrequency: 5.0,
    warpSpeed: 0.0,
    warpAmplitude: 50.0,
    warpStrength: 1.3,
    rotationAmount: 500.0,
    noiseScale: 0.55,
    grainAmount: 0.06,
    grainScale: 1.2,
    grainAnimated: false,
    contrast: 1.0,
    saturation: 0.7,
    gamma: 1.0,
    zoom: 1.0,
    blendSoftness: 0.05,
    blendAngle: 0.0,
    colorBalance: -0.04,
  },

  /** Pricing — bold blue-to-teal gradient with pronounced grain.
   *  Slightly different colour balance from features for variety. */
  pricing: {
    color1: "#606063",
    color2: "#a6a4a4",
    color3: "#5d7c79",
    timeSpeed: 0.0,
    warpFrequency: 5.0,
    warpSpeed: 0.0,
    warpAmplitude: 50.0,
    warpStrength: 1.3,
    rotationAmount: 500.0,
    noiseScale: 0.55,
    grainAmount: 0.06,
    grainScale: 1.2,
    grainAnimated: false,
    contrast: 1.0,
    saturation: 0.7,
    gamma: 1.0,
    zoom: 1.0,
    blendSoftness: 0.05,
    blendAngle: 0.0,
    colorBalance: -0.04,
  },

  /** Final CTA — bold, saturated dark canvas. Even stronger grain
   *  and brighter brand colours for maximum visual punch. */
  cta: {
    color1: "#0f172a",
    color2: "#0284c7",
    color3: "#0d9488",
    timeSpeed: 0.0,
    warpFrequency: 5.0,
    warpSpeed: 0.0,
    warpAmplitude: 50.0,
    warpStrength: 1.3,
    rotationAmount: 500.0,
    noiseScale: 2.0,
    grainAmount: 0.1,
    grainScale: 2.0,
    grainAnimated: false,
    contrast: 1.5,
    saturation: 0.7,
    gamma: 1.0,
    zoom: 1.0,
    blendSoftness: 0.05,
    blendAngle: 0.0,
    colorBalance: -0.04,
  },

  /** Footer — softer but still clearly textured. Slower motion,
   *  but grain and colour swirls remain visible. */
  footer: {
    color1: "#606063",
    color2: "#a6a4a4",
    color3: "#5d7c79",
    timeSpeed: 0.0,
    warpFrequency: 5.0,
    warpSpeed: 0.0,
    warpAmplitude: 50.0,
    warpStrength: 1.3,
    rotationAmount: 500.0,
    noiseScale: 0.55,
    grainAmount: 0.06,
    grainScale: 1.2,
    grainAnimated: false,
    contrast: 1.0,
    saturation: 0.7,
    gamma: 1.0,
    zoom: 1.0,
    blendSoftness: 0.05,
    blendAngle: 0.0,
    colorBalance: -0.04,
  },

  /** Contact page — fresh, inviting. Mid-saturation brand wash
   *  with clearly visible grain texture and soft motion. */
  contact: {
    color1: "#606063",
    color2: "#a6a4a4",
    color3: "#5d7c79",
    timeSpeed: 0.25,
    warpFrequency: 5.0,
    warpSpeed: 2.0,
    warpAmplitude: 50.0,
    warpStrength: 1.3,
    rotationAmount: 500.0,
    noiseScale: 0.55,
    grainAmount: 0.06,
    grainScale: 1.2,
    grainAnimated: false,
    contrast: 1.0,
    saturation: 0.7,
    gamma: 1.0,
    zoom: 1.0,
    blendSoftness: 0.05,
    blendAngle: 0.0,
    colorBalance: -0.04,
  },
} as const

type PresetKey = keyof typeof GRAINIENT_PRESETS

interface SectionGrainientProps {
  /** Pick a named preset, or pass `custom` and override with `grainientProps`. */
  preset: PresetKey | "custom"
  /** Override or extend any Grainient prop. */
  grainientProps?: Record<string, any>
  /** CSS opacity for the canvas (0–1). Defaults to 1 for dark presets,
   *  0.7 for light presets — high enough that grain and colour are
   *  clearly visible while text remains legible. */
  opacity?: number
  /** Additional class names on the outer wrapper (absolute overlay). */
  className?: string
}

/**
 * Drop-in absolute-positioned Grainient background.
 *
 * Usage:
 * ```tsx
 * <section className="relative overflow-hidden …">
 *   <SectionGrainient preset="features" />
 *   <div className="relative z-10">…content…</div>
 * </section>
 * ```
 */
export default function SectionGrainient({
  preset,
  grainientProps,
  opacity,
  className = "",
}: SectionGrainientProps) {
  const defaults = preset === "custom" ? {} : GRAINIENT_PRESETS[preset]

  // Dark presets render at full opacity; light presets at 0.7 so the
  // grain texture and colour swirls are clearly visible.
  const darkPresets: PresetKey[] = ["hero", "cta"]
  const resolvedOpacity =
    opacity ??
    (preset !== "custom" && darkPresets.includes(preset as PresetKey) ? 1 : 0.7)

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 ${className}`.trim()}
      style={{ opacity: resolvedOpacity }}
    >
      <Grainient {...defaults} {...grainientProps} />
    </div>
  )
}
