import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  /**
   * Force the light (white) treatment regardless of theme — for placing the mark
   * on a dark surface (top nav, marketing nav). When false (default) the mark
   * adapts to the theme: brand-navy in light mode, white in dark mode.
   */
  forceDark?: boolean
  title?: string
}

/**
 * QMS-MANAJA logo mark — a single-path vector that inherits `currentColor`, so it
 * stays crisp at any size and adapts to the light/dark theme via text color.
 * Size with a height utility (e.g. `h-6`); width follows the artwork ratio.
 */
export function Logo({ className, forceDark = false, title = "QMS-MANAJA" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 684 844"
      role="img"
      aria-label={title}
      fill="currentColor"
      preserveAspectRatio="xMidYMid meet"
      className={cn(
        "h-7 w-auto shrink-0",
        forceDark ? "text-white" : "text-brand-navy dark:text-white",
        className,
      )}
    >
      <title>{title}</title>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M146 8L378 8L394 11L422 21L452 41L473 64L489 94L495 118L496 144L496 811L489 827L477 836L450 836L436 826L430 813L430 132L426 117L417 101L402 87L385 78L366 74L155 74L132 79L116 87L106 94L89 113L79 134L76 149L77 174L83 192L97 214L115 230L132 238L157 243L410 242L411 308L148 309L107 300L88 291L68 278L46 257L31 236L17 206L12 188L9 160L10 142L16 113L26 89L45 60L61 44L80 30L101 19L131 10ZM516 250L527 251L565 264L589 277L616 297L637 319L651 338L661 355L672 381L674 392L676 393L676 503L670 522L654 554L632 584L602 611L562 634L519 648L515 647L515 580L539 571L559 560L574 548L588 533L601 514L611 490L616 468L617 444L615 424L607 397L601 384L585 360L567 342L550 330L534 322L515 316ZM187 387L227 390L250 398L273 411L288 423L304 441L315 459L324 484L327 499L328 533L327 814L320 828L309 836L289 837L277 834L270 829L262 812L262 510L258 495L247 477L230 463L210 455L188 453L172 456L150 466L137 478L124 498L120 516L121 537L126 551L135 566L153 581L163 586L182 591L243 592L242 658L185 658L165 656L143 650L121 640L100 625L78 601L65 578L58 559L54 538L56 495L65 468L80 443L99 422L125 404L155 392ZM348 591L411 592L410 658L347 658Z"
      />
    </svg>
  )
}
