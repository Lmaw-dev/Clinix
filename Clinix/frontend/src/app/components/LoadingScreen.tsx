import { ClinixLogo } from './ClinixLogo';
import CAMPUS_PHOTO from '../../assets/campus-gate.png';

const FONT   = "'Montserrat', 'Segoe UI', system-ui, sans-serif";
const YELLOW = '#F5C518';
const NAVY   = '#0B1A54';

/**
 * Shown between sign-in and the dashboard while the clinic's collections are
 * pulled from the server.
 *
 * The background is the sign-in screen's, unchanged, so the hand-off reads as
 * one continuous screen rather than a flash of a different page. The bar
 * tracks real work — see the boot sequence in App.tsx — so it does not sit at
 * a fake 90% waiting for a timer.
 */
export function LoadingScreen({
  status,
  progress,
  name,
}: {
  /** What is being fetched right now, e.g. "Loading inventory". */
  status: string;
  /** 0–1. */
  progress: number;
  /** Who just signed in, if known — greets them while they wait. */
  name?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div className="ldg-root">
      <div className="ldg-bg" aria-hidden="true">
        <img src={CAMPUS_PHOTO} alt="" className="ldg-photo" />
        <div className="ldg-wash" />
        <div className="ldg-bloom" />
        <div className="ldg-vignette" />
      </div>

      <div className="ldg-stage" role="status" aria-live="polite">
        <div className="ldg-mark">
          <span className="ldg-halo" aria-hidden="true" />
          <ClinixLogo width={78} />
        </div>

        <div className="ldg-word">
          CLINI<span style={{ color: YELLOW, fontWeight: 800 }}>X</span>
        </div>

        {name ? (
          <p className="ldg-greet">Welcome back, {name}</p>
        ) : (
          <p className="ldg-greet">Preparing your workspace</p>
        )}

        <div
          className="ldg-track"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Loading clinic records"
        >
          <div className="ldg-fill" style={{ width: `${pct}%` }} />
        </div>

        <p className="ldg-status">
          {status}
          <span className="ldg-ell" aria-hidden="true">
            <i /><i /><i />
          </span>
        </p>
      </div>

      <style>{`
        @keyframes ldgIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ldgHalo {
          0%, 100% { transform: scale(0.92); opacity: 0.45; }
          50%      { transform: scale(1.12); opacity: 0.12; }
        }
        @keyframes ldgSheen {
          from { transform: translateX(-100%); }
          to   { transform: translateX(300%); }
        }
        @keyframes ldgDot {
          0%, 60%, 100% { opacity: 0.25; }
          30%           { opacity: 1; }
        }

        .ldg-root {
          font-family: ${FONT};
          position: relative;
          height: 100vh; width: 100%;
          background: ${NAVY};
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }

        /* Background — identical to the sign-in screen. */
        .ldg-bg { position: absolute; inset: 0; overflow: hidden; }
        .ldg-photo {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; object-position: 50% 58%;
          filter: blur(4px) brightness(0.6) saturate(1.4);
          transform: scale(1.07);
        }
        .ldg-wash, .ldg-bloom, .ldg-vignette { position: absolute; inset: 0; pointer-events: none; }
        .ldg-wash {
          background: linear-gradient(158deg, rgba(5,12,52,0.82) 0%, rgba(9,24,94,0.74) 28%, rgba(17,42,136,0.58) 55%, rgba(6,17,68,0.82) 100%);
        }
        .ldg-bloom {
          background: radial-gradient(105% 78% at 40% 50%, rgba(42,92,215,0.30) 0%, rgba(42,92,215,0) 64%);
        }
        .ldg-vignette {
          background: radial-gradient(100% 100% at 48% 44%, rgba(3,8,34,0) 34%, rgba(3,8,34,0.80) 100%);
        }

        .ldg-stage {
          position: relative; z-index: 1;
          width: 100%; max-width: 340px;
          padding: 0 24px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center;
          animation: ldgIn 0.5s cubic-bezier(.16,.84,.44,1) both;
        }

        .ldg-mark { position: relative; display: flex; align-items: center; justify-content: center; }
        .ldg-halo {
          position: absolute; width: 128px; height: 128px; border-radius: 50%;
          background: radial-gradient(circle, rgba(245,197,24,0.34) 0%, rgba(245,197,24,0) 68%);
          animation: ldgHalo 2.4s ease-in-out infinite;
        }

        .ldg-word {
          margin-top: 16px;
          font-size: 13px; font-weight: 500; color: #FFFFFF;
          letter-spacing: 0.36em; text-indent: 0.36em;
          text-shadow: 0 2px 10px rgba(4,12,45,0.5);
        }

        .ldg-greet {
          margin: 26px 0 0;
          font-size: 14.5px; font-weight: 600;
          color: rgba(255,255,255,0.92);
          text-shadow: 0 1px 12px rgba(4,12,45,0.5);
        }

        .ldg-track {
          width: 100%; height: 4px; margin-top: 20px;
          border-radius: 999px; overflow: hidden;
          background: rgba(255,255,255,0.16);
          box-shadow: inset 0 1px 2px rgba(3,8,34,0.35);
        }
        .ldg-fill {
          position: relative; height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #E39C05, ${YELLOW} 60%, #FFE372);
          box-shadow: 0 0 12px rgba(245,197,24,0.55);
          transition: width 0.45s cubic-bezier(.16,.84,.44,1);
        }
        /* A travelling highlight, so a slow step still looks alive while the
           bar itself is not advancing. */
        .ldg-fill::after {
          content: ''; position: absolute; inset: 0;
          width: 34%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: ldgSheen 1.5s ease-in-out infinite;
        }

        .ldg-status {
          margin: 14px 0 0;
          font-size: 11.5px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: rgba(255,255,255,0.66);
          display: inline-flex; align-items: baseline; gap: 1px;
        }
        .ldg-ell { display: inline-flex; gap: 2px; margin-left: 3px; }
        .ldg-ell i {
          width: 2.5px; height: 2.5px; border-radius: 50%;
          background: currentColor; display: block;
          animation: ldgDot 1.4s ease-in-out infinite;
        }
        .ldg-ell i:nth-child(2) { animation-delay: 0.18s; }
        .ldg-ell i:nth-child(3) { animation-delay: 0.36s; }

        @media (prefers-reduced-motion: reduce) {
          .ldg-stage { animation: none; }
          .ldg-halo, .ldg-fill::after, .ldg-ell i { animation: none; }
          .ldg-ell i { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
