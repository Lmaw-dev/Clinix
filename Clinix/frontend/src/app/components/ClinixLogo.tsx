import { useId } from 'react';

/**
 * The Clinix mark, rebuilt as vector: gold "C" ring enclosing a medical cross,
 * with the left half of the "X" rendered as the blue chevron.
 *
 * Drawn rather than bitmapped so it carries no background plate and stays sharp
 * at any size — it sits directly on the navy of the sign-in screen, the landing
 * page, and the sidebar without a container behind it.
 *
 * The gradients are given per-instance ids. Several copies appear in the same
 * document (the landing page alone renders it in the nav and the footer), and
 * duplicate SVG ids would make every copy resolve to whichever was parsed first.
 */
export function ClinixLogo({
  width = 40,
  className,
  style,
  title = 'Clinix',
}: {
  width?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible name; pass null for a purely decorative copy. */
  title?: string | null;
}) {
  const uid = useId();
  const gold = `clx-gold-${uid}`;
  const blue = `clx-blue-${uid}`;

  return (
    <svg
      width={width}
      height={Math.round((width * 650) / 800)}
      viewBox="275 185 800 650"
      fill="none"
      className={className}
      style={style}
      role={title ? 'img' : 'presentation'}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gold} x1="0.18" y1="0" x2="0.62" y2="1">
          <stop offset="0%"   stopColor="#FFE372" />
          <stop offset="42%"  stopColor="#F8C61F" />
          <stop offset="100%" stopColor="#E39C05" />
        </linearGradient>
        <linearGradient id={blue} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%"   stopColor="#0C3ED6" />
          <stop offset="46%"  stopColor="#2371F2" />
          <stop offset="100%" stopColor="#062A9B" />
        </linearGradient>
      </defs>

      {/* gold X — right half only; the left half is the blue chevron below */}
      <path d="M900,318 L1075,318 L829,523 L731,459 Z" fill={`url(#${gold})`} />
      <path d="M900,706 L1075,706 L829,501 L731,565 Z" fill={`url(#${gold})`} />

      {/* gold "C" ring, open to the right */}
      <path
        d="M752.6,223 A325,325 0 1 0 752.6,797 L705.7,708.6 A225,225 0 1 1 705.7,311.4 Z"
        fill={`url(#${gold})`}
      />

      {/* medical cross inside the ring */}
      <g fill={`url(#${gold})`}>
        <rect x="415" y="476" width="200" height="78" rx="15" />
        <rect x="476" y="415" width="78"  height="200" rx="15" />
      </g>

      {/* blue chevron — the left half of the X */}
      <path d="M540,305 L866,512 L540,719 L540,609 L690,512 L540,415 Z" fill={`url(#${blue})`} />
    </svg>
  );
}
