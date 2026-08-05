/**
 * The DevFit brand mark: angle brackets clamping a barbell — "code" and "fit"
 * in one glyph. Inline SVG for the same reason the nav icons are (no icon
 * package for a handful of shapes), and so the tile can sit on any background
 * without a transparent-PNG halo. `app/icon.svg` is the same artwork.
 *
 * The tile reads through `--df-logo-tile` rather than a fixed hex, because a
 * near-black tile disappears against the dark canvas.
 *
 * The gradient needs an id, and both the sidebar and the mobile header render a
 * mark on the same page. The two definitions are identical, so a duplicate id
 * resolves to the same paint either way — no `useId()`, which would force this
 * into a client component for no visual gain.
 */
const GRADIENT_ID = "devfit-mark-gradient";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`${className} shrink-0`}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="55%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="var(--df-logo-tile)" />
      {/* Scaled to 0.8 about the centre so the glyph clears the rounded corners. */}
      <g
        transform="translate(32 32) scale(0.8) translate(-32 -32)"
        fill={`url(#${GRADIENT_ID})`}
        stroke={`url(#${GRADIENT_ID})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 20 6 32l8 12" fill="none" />
        <rect x="16" y="24" width="6" height="16" rx="2" stroke="none" />
        <path d="M22 32h20" />
        <rect x="42" y="24" width="6" height="16" rx="2" stroke="none" />
        <path d="M50 20l8 12-8 12" fill="none" />
      </g>
    </svg>
  );
}

/**
 * Mark + wordmark. `Dev` in heading ink, `Fit` in the brand accent — the same
 * split the app icon uses.
 */
export function Logo({
  className = "",
  markClassName = "h-9 w-9",
  wordmarkClassName = "text-lg",
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span
        className={`font-extrabold tracking-tight text-heading ${wordmarkClassName}`}
      >
        Dev<span className="text-accent">Fit</span>
      </span>
    </span>
  );
}
