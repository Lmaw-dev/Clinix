import { useEffect, useState } from 'react';
import {
  Stethoscope, Users, GraduationCap, FileText, Boxes, BadgeCheck,
  BarChart3, ShieldCheck, ArrowRight, ArrowUp, ClipboardList, HeartPulse,
  CheckCircle2, Lock, MapPin, Mail, Clock,
} from 'lucide-react';
import { ClinixLogo } from './ClinixLogo';
import CAMPUS_PHOTO from '../../assets/campus-gate.png';

type Props = { onSignIn: () => void };

/* Same tokens as the sign-in screen so the two read as one product. */
const FONT      = "'Montserrat', 'Segoe UI', system-ui, sans-serif";
const YELLOW    = '#F5C518';
const YELLOW_DK = '#E8B910';
const NAVY      = '#0B1A54';

/* ── Content ──────────────────────────────────────────────────────────────
   Everything below is drawn from what the system actually does — the module
   list mirrors the sidebar, and the roles mirror ROLE_PAGES in auth.ts. */

const MODULES = [
  {
    icon: Stethoscope,
    title: 'Consultation Log',
    body: 'One shared daily treatment record. Every walk-in is logged with the purpose of the visit — consultation, medicine, treatment, or certificate — then carried through intake, evaluation, and confirmation.',
  },
  {
    icon: Users,
    title: 'Student Directory',
    body: 'Complete student health profiles: enrolment status, blood type, allergies, current medications, guardian and boarding-house details, plus the full consultation history for each record.',
  },
  {
    icon: GraduationCap,
    title: 'Faculty & Staff Directory',
    body: 'The same profile depth for teaching, non-teaching, and agency personnel, including employment classification, next of kin, and recorded medical history.',
  },
  {
    icon: FileText,
    title: 'Medical Records & Forms',
    body: 'Upload a blank form once, then compile every filled copy under it. Each person’s document is filed against the form it belongs to, so the file and its listing never drift apart.',
  },
  {
    icon: Boxes,
    title: 'Medicine & Supply Inventory',
    body: 'Medicines, medical supplies, dental, and janitorial stock in one register — with month-by-month remaining and dispensed counts, expiry dates, and low-stock visibility.',
  },
  {
    icon: BadgeCheck,
    title: 'Medical Certificates',
    body: 'Issue and track clinic-issued certificates against the student record they came from, with the request status visible from creation to release.',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    body: 'Consultation volume, stock movement, and directory summaries pulled straight from live records — ready for the reports the campus clinic already has to file.',
  },
  {
    icon: ShieldCheck,
    title: 'Accounts & Access Control',
    body: 'Role-based accounts managed by the clinic administrator, so each person only reaches the screens their work actually requires.',
  },
] as const;

const WORKFLOW = [
  {
    icon: ClipboardList,
    step: '01',
    title: 'Log the visit',
    body: 'The patient is looked up in the directory and an entry is opened with the reason for the visit and the time they came in.',
  },
  {
    icon: HeartPulse,
    step: '02',
    title: 'Record vital signs',
    body: 'Staff take the assessment and vitals — BP, PR, RR, temperature, O₂ saturation — straight onto the same entry.',
  },
  {
    icon: Stethoscope,
    step: '03',
    title: 'Evaluate & treat',
    body: 'The nurse or assistant reviews the intake, records the management and treatment given, and dispenses medicine, which deducts from stock automatically.',
  },
  {
    icon: CheckCircle2,
    step: '04',
    title: 'Confirm & file',
    body: 'The confirmed entry joins the patient’s permanent history and feeds the clinic’s reports — no separate logbook to reconcile.',
  },
] as const;

const ROLES = [
  {
    name: 'Administrator',
    who: 'Campus Nurse',
    body: 'Full access to every module, plus account management and the confidential notes held on each record.',
    perks: ['All clinic modules', 'Manage user accounts', 'View confidential notes', 'Confirm consultations'],
  },
  {
    name: 'Assistant Administrator',
    who: 'Clinic Assistant',
    body: 'Runs the day-to-day log — creates entries, evaluates intakes, and maintains directories, inventory, and forms.',
    perks: ['All clinic modules', 'Evaluate consultations', 'Maintain inventory', 'No account management'],
  },
  {
    name: 'Staff',
    who: 'Student Assistant / Working Scholar',
    body: 'Assists at intake. Records the assessment and vital signs of whoever is being checked, without editing the log itself.',
    perks: ['Dashboard & log view', 'Record vital signs', 'Generate reports', 'Change own password'],
  },
] as const;

const SAFEGUARDS = [
  { icon: Lock,        title: 'Encrypted at rest',     body: 'Account details are AES-encrypted in the database and passwords are stored only as bcrypt hashes — never in plain text, never in the browser bundle.' },
  { icon: ShieldCheck, title: 'Server-verified sign-in', body: 'Only the server can verify a password and issue a session token. There is no offline shortcut into the system.' },
  { icon: Clock,       title: 'Sessions that expire',   body: 'A revoked or expired token returns the user to the sign-in screen instead of leaving records open on an unattended machine.' },
  { icon: Users,       title: 'Need-to-know access',    body: 'Role-based permissions gate every page, and the most sensitive fields are visible to the campus nurse alone.' },
] as const;

const FACTS = [
  { value: '8',    label: 'Connected modules' },
  { value: '3',    label: 'Access levels' },
  { value: '1',    label: 'Shared consultation log' },
  { value: '24/7', label: 'Records on hand' },
] as const;

export function LandingPage({ onSignIn }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Landing is mounted in place of the sign-in screen, so it inherits whatever
  // scroll position the previous view left behind.
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── Brand mark — same vector as the sign-in screen ───────────────────── */
  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <ClinixLogo width={42} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.22em' }}>
          CLINI<span style={{ color: YELLOW }}>X</span>
        </div>
        <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.62)', letterSpacing: '0.13em', marginTop: 4 }}>
          BISU CALAPE CAMPUS
        </div>
      </div>
    </div>
  );

  return (
    <div className="lnd-root">
      {/* ── Background: identical treatment to the sign-in screen, held fixed
             so the campus photo does not scroll away with the content. ──── */}
      <div className="lnd-bg" aria-hidden="true">
        <img src={CAMPUS_PHOTO} alt="" className="lnd-photo" />
        <div className="lnd-wash" />
        <div className="lnd-bloom" />
        <div className="lnd-vignette" />
      </div>

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className={`lnd-nav${scrolled ? ' lnd-nav-solid' : ''}`}>
        <div className="lnd-nav-inner">
          <button type="button" className="lnd-brandbtn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            {brand}
          </button>

          <nav className="lnd-links">
            <button type="button" onClick={() => jump('modules')}>Modules</button>
            <button type="button" onClick={() => jump('workflow')}>How it works</button>
            <button type="button" onClick={() => jump('roles')}>Roles</button>
            <button type="button" onClick={() => jump('security')}>Security</button>
          </nav>

          <button type="button" className="lnd-btn lnd-btn-gold lnd-btn-sm" onClick={onSignIn}>
            Sign In <ArrowRight size={15} />
          </button>
        </div>
      </header>

      <main className="lnd-main">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="lnd-hero">
          <div className="lnd-dots lnd-dots-hero" aria-hidden="true" />

          <span className="lnd-pill lnd-up" style={{ animationDelay: '0.04s' }}>
            <span className="lnd-pulse" />
            Bohol Island State University — Calape Campus Clinic
          </span>

          <h1 className="lnd-h1 lnd-up" style={{ animationDelay: '0.1s' }}>
            The campus clinic,<br />
            <span className="lnd-h1-gold">on one record.</span>
          </h1>

          <p className="lnd-lead lnd-up" style={{ animationDelay: '0.16s' }}>
            Clinix replaces the clinic’s paper logbooks and scattered spreadsheets with a single
            management system — consultations, student and faculty health profiles, medical
            records, certificates, and medicine stock all held together, so the nurse spends the
            visit on the patient instead of on the paperwork.
          </p>

          <div className="lnd-cta lnd-up" style={{ animationDelay: '0.22s' }}>
            <button type="button" className="lnd-btn lnd-btn-gold" onClick={onSignIn}>
              Sign In to Clinix <ArrowRight size={16} />
            </button>
            <button type="button" className="lnd-btn lnd-btn-ghost" onClick={() => jump('modules')}>
              Explore the System
            </button>
          </div>

          <div className="lnd-facts lnd-up" style={{ animationDelay: '0.3s' }}>
            {FACTS.map((f) => (
              <div key={f.label} className="lnd-fact">
                <div className="lnd-fact-v">{f.value}</div>
                <div className="lnd-fact-l">{f.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── The problem it answers ──────────────────────────────────────── */}
        <section className="lnd-sec" id="about">
          <div className="lnd-glass lnd-about">
            <div>
              <span className="lnd-eyebrow">Why Clinix</span>
              <h2 className="lnd-h2">Built around how the clinic already works</h2>
              <p className="lnd-body">
                Records kept on paper are slow to search, easy to misfile, and impossible to
                summarise at the end of a semester. Medicine counts live in one workbook, consultations
                in another, and the certificate a student needs tomorrow depends on finding the right
                folder today.
              </p>
              <p className="lnd-body">
                Clinix keeps every one of those in the same place and in the same order the clinic
                already follows — so nothing has to be entered twice, and the history of a patient
                is one search away rather than one cabinet away.
              </p>
            </div>
            <ul className="lnd-checks">
              {[
                'Patient history retrieved in seconds, not filing drawers',
                'Stock counts that update themselves as medicine is dispensed',
                'Expiry dates surfaced before the medicine is needed',
                'Reports built from live records, not re-typed at deadline',
                'One shared log every role works from at the same time',
              ].map((t) => (
                <li key={t}>
                  <CheckCircle2 size={17} className="lnd-check-i" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Modules ─────────────────────────────────────────────────────── */}
        <section className="lnd-sec" id="modules">
          <div className="lnd-sec-head">
            <span className="lnd-eyebrow">What’s inside</span>
            <h2 className="lnd-h2">Eight modules, one system</h2>
            <p className="lnd-sub">
              Each part of the clinic’s work has its own screen, and they all read from the same
              records — an update in one is an update everywhere.
            </p>
          </div>

          <div className="lnd-grid lnd-grid-4">
            {MODULES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="lnd-glass lnd-card">
                <span className="lnd-ico"><Icon size={20} /></span>
                <h3 className="lnd-h3">{title}</h3>
                <p className="lnd-card-body">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Workflow ────────────────────────────────────────────────────── */}
        <section className="lnd-sec" id="workflow">
          <div className="lnd-sec-head">
            <span className="lnd-eyebrow">How it works</span>
            <h2 className="lnd-h2">From walk-in to filed record</h2>
            <p className="lnd-sub">
              One consultation moves through four hands without ever leaving the same entry.
            </p>
          </div>

          <div className="lnd-grid lnd-grid-4">
            {WORKFLOW.map(({ icon: Icon, step, title, body }) => (
              <article key={step} className="lnd-glass lnd-card lnd-step">
                <span className="lnd-step-n">{step}</span>
                <span className="lnd-ico"><Icon size={20} /></span>
                <h3 className="lnd-h3">{title}</h3>
                <p className="lnd-card-body">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Roles ───────────────────────────────────────────────────────── */}
        <section className="lnd-sec" id="roles">
          <div className="lnd-sec-head">
            <span className="lnd-eyebrow">Who uses it</span>
            <h2 className="lnd-h2">Three roles, clearly separated</h2>
            <p className="lnd-sub">
              Access follows responsibility. Everyone works from the same log, but not with the same powers.
            </p>
          </div>

          <div className="lnd-grid lnd-grid-3">
            {ROLES.map((r) => (
              <article key={r.name} className="lnd-glass lnd-card lnd-role">
                <span className="lnd-role-who">{r.who}</span>
                <h3 className="lnd-h3">{r.name}</h3>
                <p className="lnd-card-body">{r.body}</p>
                <ul className="lnd-perks">
                  {r.perks.map((p) => (
                    <li key={p}><CheckCircle2 size={14} className="lnd-check-i" /><span>{p}</span></li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* ── Security ────────────────────────────────────────────────────── */}
        <section className="lnd-sec" id="security">
          <div className="lnd-sec-head">
            <span className="lnd-eyebrow">Safeguards</span>
            <h2 className="lnd-h2">Medical records, handled like medical records</h2>
            <p className="lnd-sub">
              The system holds health information about real students and staff, so it is built to
              protect it rather than merely store it.
            </p>
          </div>

          <div className="lnd-grid lnd-grid-4">
            {SAFEGUARDS.map(({ icon: Icon, title, body }) => (
              <article key={title} className="lnd-glass lnd-card">
                <span className="lnd-ico lnd-ico-shield"><Icon size={19} /></span>
                <h3 className="lnd-h3">{title}</h3>
                <p className="lnd-card-body">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Closing call to action ──────────────────────────────────────── */}
        <section className="lnd-sec">
          <div className="lnd-glass lnd-final">
            <div className="lnd-dots lnd-dots-final" aria-hidden="true" />
            <h2 className="lnd-h2" style={{ marginBottom: 12 }}>Ready when you are</h2>
            <p className="lnd-sub" style={{ margin: '0 auto 30px' }}>
              Clinix accounts are issued by the campus clinic administrator. Sign in with the
              credentials given to you to open your dashboard.
            </p>
            <div className="lnd-cta" style={{ justifyContent: 'center' }}>
              <button type="button" className="lnd-btn lnd-btn-gold" onClick={onSignIn}>
                Sign In to Clinix <ArrowRight size={16} />
              </button>
              <button
                type="button"
                className="lnd-btn lnd-btn-ghost"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <ArrowUp size={15} /> Back to top
              </button>
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="lnd-foot">
          <div className="lnd-foot-inner">
            {brand}
            <div className="lnd-foot-meta">
              <span><MapPin size={13} /> BISU Calape Campus, Calape, Bohol</span>
              <span><Mail size={13} /> University Clinic — Health Services Unit</span>
            </div>
          </div>
          <div className="lnd-foot-rule" />
          <p className="lnd-foot-note">
            Clinix — Clinic Management System for Bohol Island State University, Calape Campus.
            An academic capstone system developed for the campus health services unit.
          </p>
        </footer>
      </main>

      <style>{`
        @keyframes lndUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lndPhotoIn {
          from { opacity: 0; transform: scale(1.12); }
          to   { opacity: 1; transform: scale(1.07); }
        }
        @keyframes lndPulse {
          0%, 100% { opacity: 1;   transform: scale(1); }
          50%      { opacity: 0.35; transform: scale(0.82); }
        }

        .lnd-root {
          font-family: ${FONT};
          position: relative;
          min-height: 100vh;
          width: 100%;
          background: ${NAVY};
          color: #FFFFFF;
          overflow-x: hidden;
        }

        /* ── Background ─────────────────────────────────────────────────── */
        .lnd-bg { position: fixed; inset: 0; overflow: hidden; z-index: 0; }
        .lnd-photo {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; object-position: 50% 58%;
          filter: blur(4px) brightness(0.6) saturate(1.4);
          transform: scale(1.07);
          animation: lndPhotoIn 1.3s cubic-bezier(.16,.84,.44,1) both;
        }
        .lnd-wash, .lnd-bloom, .lnd-vignette { position: absolute; inset: 0; pointer-events: none; }
        /* Alphas sit short of opaque so the campus behind stays legible as a
           place rather than a flat blue field; the vignette carries the
           contrast the text actually needs. Matches the sign-in screen. */
        .lnd-wash {
          background: linear-gradient(158deg, rgba(5,12,52,0.82) 0%, rgba(9,24,94,0.74) 28%, rgba(17,42,136,0.58) 55%, rgba(6,17,68,0.82) 100%);
        }
        .lnd-bloom {
          background: radial-gradient(105% 78% at 40% 50%, rgba(42,92,215,0.30) 0%, rgba(42,92,215,0) 64%);
        }
        .lnd-vignette {
          background: radial-gradient(100% 100% at 48% 44%, rgba(3,8,34,0) 34%, rgba(3,8,34,0.80) 100%);
        }

        .lnd-main { position: relative; z-index: 1; }

        /* ── Nav ────────────────────────────────────────────────────────── */
        .lnd-nav {
          position: sticky; top: 0; z-index: 20;
          transition: background 0.25s, backdrop-filter 0.25s, border-color 0.25s;
          border-bottom: 1px solid transparent;
        }
        .lnd-nav-solid {
          background: rgba(6,16,62,0.72);
          backdrop-filter: blur(16px) saturate(1.2);
          -webkit-backdrop-filter: blur(16px) saturate(1.2);
          border-bottom-color: rgba(255,255,255,0.12);
        }
        .lnd-nav-inner {
          max-width: 1180px; margin: 0 auto;
          padding: 18px 28px;
          display: flex; align-items: center; gap: 24px;
        }
        .lnd-brandbtn {
          background: none; border: none; padding: 0; cursor: pointer;
          font-family: inherit; text-align: left;
        }
        .lnd-links {
          margin-left: auto;
          display: flex; align-items: center; gap: 4px;
        }
        .lnd-links button {
          background: none; border: none; cursor: pointer;
          font-family: inherit; font-size: 13px; font-weight: 600;
          color: rgba(255,255,255,0.78);
          padding: 8px 14px; border-radius: 999px;
          transition: color 0.18s, background 0.18s;
        }
        .lnd-links button:hover { color: #FFFFFF; background: rgba(255,255,255,0.10); }

        /* ── Buttons ────────────────────────────────────────────────────── */
        .lnd-btn {
          border: none; border-radius: 999px; cursor: pointer;
          font-family: ${FONT}; font-size: 14px; font-weight: 700;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 0 26px; height: 46px;
          transition: background 0.2s, transform 0.18s, box-shadow 0.18s, border-color 0.2s;
        }
        .lnd-btn-sm { height: 38px; padding: 0 20px; font-size: 13px; }
        .lnd-btn-gold {
          background: ${YELLOW}; color: #FFFFFF;
          box-shadow: 0 6px 18px rgba(245,197,24,0.30);
        }
        .lnd-btn-gold:hover {
          background: ${YELLOW_DK}; transform: translateY(-1px);
          box-shadow: 0 10px 26px rgba(245,197,24,0.40);
        }
        .lnd-btn-ghost {
          background: rgba(255,255,255,0.10); color: #FFFFFF;
          border: 1px solid rgba(255,255,255,0.28);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .lnd-btn-ghost:hover {
          background: rgba(255,255,255,0.18);
          border-color: rgba(255,255,255,0.45);
          transform: translateY(-1px);
        }
        .lnd-btn:active { transform: translateY(0); }
        .lnd-btn:focus-visible { outline: 2px solid #FFFFFF; outline-offset: 3px; }
        .lnd-links button:focus-visible,
        .lnd-brandbtn:focus-visible { outline: 2px solid ${YELLOW}; outline-offset: 4px; border-radius: 8px; }

        /* ── Hero ───────────────────────────────────────────────────────── */
        .lnd-hero {
          position: relative;
          max-width: 900px; margin: 0 auto;
          padding: 88px 28px 96px;
          text-align: center;
        }
        .lnd-up { opacity: 0; animation: lndUp 0.7s cubic-bezier(.16,.84,.44,1) both; }

        .lnd-pill {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 8px 18px 8px 14px; border-radius: 999px;
          background: rgba(255,255,255,0.11);
          border: 1px solid rgba(255,255,255,0.22);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          font-size: 12px; font-weight: 600; letter-spacing: 0.02em;
          color: rgba(255,255,255,0.92);
        }
        .lnd-pulse {
          width: 7px; height: 7px; border-radius: 50%;
          background: ${YELLOW}; flex-shrink: 0;
          box-shadow: 0 0 0 4px rgba(245,197,24,0.22);
          animation: lndPulse 2.2s ease-in-out infinite;
        }

        .lnd-h1 {
          font-size: 64px; font-weight: 800; line-height: 1.02;
          letter-spacing: -0.035em; margin: 26px 0 0;
          text-shadow: 0 4px 30px rgba(4,12,45,0.55);
        }
        .lnd-h1-gold {
          background: linear-gradient(100deg, #FFE372 0%, ${YELLOW} 45%, #E39C05 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent; color: transparent;
        }
        .lnd-lead {
          font-size: 16px; line-height: 1.68; font-weight: 500;
          color: rgba(255,255,255,0.84);
          max-width: 660px; margin: 24px auto 0;
          text-shadow: 0 1px 12px rgba(4,12,45,0.45);
        }
        .lnd-cta {
          display: flex; flex-wrap: wrap; gap: 14px;
          justify-content: center; margin-top: 38px;
        }

        .lnd-facts {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 14px; margin-top: 62px;
        }
        .lnd-fact {
          padding: 20px 14px; border-radius: 18px;
          background: linear-gradient(150deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%);
          border: 1px solid rgba(255,255,255,0.18);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        }
        .lnd-fact-v { font-size: 32px; font-weight: 800; color: ${YELLOW}; letter-spacing: -0.03em; }
        .lnd-fact-l { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.72); margin-top: 6px; letter-spacing: 0.03em; }

        /* ── Sections ───────────────────────────────────────────────────── */
        .lnd-sec { max-width: 1180px; margin: 0 auto; padding: 54px 28px; }
        .lnd-sec-head { max-width: 640px; margin: 0 auto 40px; text-align: center; }
        .lnd-eyebrow {
          display: inline-block;
          font-size: 11px; font-weight: 800; letter-spacing: 0.16em;
          text-transform: uppercase; color: ${YELLOW};
          margin-bottom: 14px;
        }
        .lnd-h2 {
          font-size: 36px; font-weight: 800; line-height: 1.12;
          letter-spacing: -0.028em; margin: 0;
          text-shadow: 0 3px 20px rgba(4,12,45,0.45);
        }
        .lnd-sub {
          font-size: 15px; line-height: 1.62; font-weight: 500;
          color: rgba(255,255,255,0.76); margin: 16px 0 0; max-width: 620px;
        }
        .lnd-sec-head .lnd-sub { margin-left: auto; margin-right: auto; }
        .lnd-body {
          font-size: 14.5px; line-height: 1.72; font-weight: 500;
          color: rgba(255,255,255,0.80); margin: 16px 0 0;
        }
        .lnd-h3 {
          font-size: 16px; font-weight: 700; letter-spacing: -0.012em;
          margin: 16px 0 0; color: #FFFFFF;
        }

        /* ── Glass surface ──────────────────────────────────────────────── */
        .lnd-glass {
          background: linear-gradient(150deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.06) 100%);
          backdrop-filter: blur(18px) saturate(1.25);
          -webkit-backdrop-filter: blur(18px) saturate(1.25);
          border: 1px solid rgba(255,255,255,0.20);
          border-radius: 24px;
          box-shadow: 0 24px 56px rgba(4,12,45,0.32), inset 0 1px 0 rgba(255,255,255,0.24);
        }

        .lnd-grid { display: grid; gap: 18px; }
        .lnd-grid-4 { grid-template-columns: repeat(4, 1fr); }
        .lnd-grid-3 { grid-template-columns: repeat(3, 1fr); }

        .lnd-card {
          padding: 26px 24px 28px;
          transition: transform 0.22s cubic-bezier(.16,.84,.44,1), border-color 0.22s, box-shadow 0.22s;
        }
        .lnd-card:hover {
          transform: translateY(-4px);
          border-color: rgba(245,197,24,0.42);
          box-shadow: 0 30px 62px rgba(4,12,45,0.42), inset 0 1px 0 rgba(255,255,255,0.28);
        }
        .lnd-card-body {
          font-size: 13.5px; line-height: 1.65; font-weight: 500;
          color: rgba(255,255,255,0.76); margin: 10px 0 0;
        }
        .lnd-ico {
          display: inline-flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; border-radius: 14px;
          background: linear-gradient(145deg, rgba(245,197,24,0.30), rgba(245,197,24,0.12));
          border: 1px solid rgba(245,197,24,0.42);
          color: ${YELLOW};
        }
        .lnd-ico-shield {
          background: linear-gradient(145deg, rgba(93,150,255,0.30), rgba(93,150,255,0.10));
          border-color: rgba(140,185,255,0.42);
          color: #A8C8FF;
        }

        /* ── About block ────────────────────────────────────────────────── */
        .lnd-about {
          padding: 44px 46px;
          display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 44px; align-items: center;
        }
        .lnd-checks, .lnd-perks { list-style: none; margin: 0; padding: 0; }
        .lnd-checks li {
          display: flex; align-items: flex-start; gap: 11px;
          font-size: 14px; font-weight: 600; line-height: 1.5;
          color: rgba(255,255,255,0.88);
          padding: 13px 0; border-bottom: 1px solid rgba(255,255,255,0.10);
        }
        .lnd-checks li:last-child { border-bottom: none; }
        .lnd-check-i { color: ${YELLOW}; flex-shrink: 0; margin-top: 1px; }

        /* ── Workflow steps ─────────────────────────────────────────────── */
        .lnd-step { position: relative; }
        .lnd-step-n {
          position: absolute; top: 22px; right: 24px;
          font-size: 30px; font-weight: 800; letter-spacing: -0.04em;
          color: rgba(255,255,255,0.14);
        }

        /* ── Roles ──────────────────────────────────────────────────────── */
        .lnd-role-who {
          display: inline-block;
          font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: ${YELLOW};
          padding: 5px 12px; border-radius: 999px;
          background: rgba(245,197,24,0.14);
          border: 1px solid rgba(245,197,24,0.34);
        }
        .lnd-role .lnd-h3 { font-size: 19px; margin-top: 14px; }
        .lnd-perks { margin-top: 18px; border-top: 1px solid rgba(255,255,255,0.12); padding-top: 6px; }
        .lnd-perks li {
          display: flex; align-items: center; gap: 9px;
          font-size: 12.5px; font-weight: 600;
          color: rgba(255,255,255,0.80); padding: 8px 0;
        }

        /* ── Final CTA ──────────────────────────────────────────────────── */
        .lnd-final { position: relative; padding: 56px 40px 60px; text-align: center; overflow: hidden; }

        /* ── Dot matrices, as on the sign-in screen ─────────────────────── */
        .lnd-dots {
          position: absolute; pointer-events: none;
          background-image: radial-gradient(circle, rgba(255,255,255,0.5) 1.2px, transparent 1.3px);
          background-size: 13.5px 13.5px;
        }
        .lnd-dots-hero {
          left: 50%; transform: translateX(-50%); top: 0; width: 150px; height: 70px;
          -webkit-mask-image: linear-gradient(to bottom, #000 30%, transparent 100%);
          mask-image: linear-gradient(to bottom, #000 30%, transparent 100%);
        }
        .lnd-dots-final {
          right: 26px; bottom: 22px; width: 112px; height: 96px;
          -webkit-mask-image: linear-gradient(to top left, #000 22%, transparent 88%);
          mask-image: linear-gradient(to top left, #000 22%, transparent 88%);
        }

        /* ── Footer ─────────────────────────────────────────────────────── */
        .lnd-foot { max-width: 1180px; margin: 0 auto; padding: 30px 28px 46px; }
        .lnd-foot-inner {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 20px;
        }
        .lnd-foot-meta {
          display: flex; flex-wrap: wrap; gap: 22px;
          font-size: 12.5px; font-weight: 500; color: rgba(255,255,255,0.66);
        }
        .lnd-foot-meta span { display: inline-flex; align-items: center; gap: 7px; }
        .lnd-foot-rule { height: 1px; background: rgba(255,255,255,0.14); margin: 24px 0 18px; }
        .lnd-foot-note {
          font-size: 12px; line-height: 1.6; font-weight: 500;
          color: rgba(255,255,255,0.52); margin: 0;
        }

        /* ── Responsive ─────────────────────────────────────────────────── */
        @media (max-width: 1024px) {
          .lnd-grid-4 { grid-template-columns: repeat(2, 1fr); }
          .lnd-grid-3 { grid-template-columns: repeat(2, 1fr); }
          .lnd-about { grid-template-columns: 1fr; gap: 30px; padding: 36px 32px; }
          .lnd-h1 { font-size: 50px; }
        }
        @media (max-width: 720px) {
          .lnd-links { display: none; }
          .lnd-nav-inner { padding: 14px 20px; }
          .lnd-hero { padding: 56px 20px 68px; }
          .lnd-h1 { font-size: 38px; }
          .lnd-h2 { font-size: 27px; }
          .lnd-lead { font-size: 15px; }
          .lnd-sec { padding: 40px 20px; }
          .lnd-grid-4, .lnd-grid-3 { grid-template-columns: 1fr; }
          .lnd-facts { grid-template-columns: repeat(2, 1fr); margin-top: 44px; }
          .lnd-final { padding: 40px 24px 44px; }
          .lnd-foot { padding: 24px 20px 40px; }
          .lnd-btn { width: 100%; }
          .lnd-btn-sm { width: auto; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lnd-up, .lnd-photo { animation: none !important; opacity: 1 !important; transform: none !important; }
          .lnd-photo { transform: scale(1.07) !important; }
          .lnd-pulse { animation: none !important; }
          .lnd-card:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}
