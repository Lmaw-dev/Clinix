import MARK from '../../assets/clinix-logo.png';

/**
 * The Clinix logo.
 *
 * Only the mark — the gold "C" ring and the blue X — is used in the app. The
 * artwork also carries a "clinix" wordmark beneath it, but every placement here
 * (sign-in, landing, sidebar, loading splash, settings) already sets the word
 * CLINIX in type beside or below the logo, so the baked-in wordmark would only
 * repeat it. The full lockup is used for the browser tab instead, where it
 * stands on its own — see public/favicon.png.
 *
 * The crop has a transparent background, so the mark sits directly on the navy
 * of the sign-in screen and the sidebar without a container behind it.
 */
const NATURAL = { w: 512, h: 405 };

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
  return (
    <img
      src={MARK}
      width={width}
      height={Math.round((width * NATURAL.h) / NATURAL.w)}
      className={className}
      // block, so the image does not sit on a text baseline and leave a gap
      // beneath it inside the flex rows that hold the brand lockups.
      style={{ display: 'block', objectFit: 'contain', ...style }}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
  );
}
