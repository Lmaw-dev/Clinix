// ── Who is allowed to change what ────────────────────────────────────────────
// The UI already decides which pages a role can open, and auth.js already
// decides whether a request carries a valid session. Neither of those answers
// the question this file exists for: a signed-in staff account, whose sidebar
// shows four pages, could still send DELETE /api/students/000001 by hand and the
// server would carry it out. The sidebar is a convenience, not a boundary.
//
// Reads are deliberately left open to every signed-in role. The dashboard and
// the reports page load the whole clinic — students, faculty, inventory,
// consultations — for staff as much as for the nurse, so restricting reads is a
// field-level question (which columns may a staff account see?) rather than a
// route-level one, and is handled separately. What follows covers writes, where
// route-level is exactly the right altitude.

/** Every signed-in role. */
const ALL = ['admin', 'assistant', 'staff'];
/** The nurse and the assistant administrator — the people who own the records. */
const CLINIC = ['admin', 'assistant'];
/** The nurse alone. */
const ADMIN = ['admin'];

/**
 * Which roles may POST / PUT / DELETE each resource.
 *
 * A resource missing from this map is admin-only (see roleFor). That default
 * matters more than any single entry here: when someone adds a route next
 * month and forgets this file, the failure is a 403 for the assistant, not a
 * silent hole for the staff account.
 */
const WRITE_ROLES = {
  // Records and directories: the clinic's own data, kept by the nurse and the
  // assistant. Staff read these on the dashboard but do not edit them.
  students: CLINIC,
  faculty: CLINIC,
  medicalRecords: CLINIC,
  medicalForms: CLINIC,
  certificates: CLINIC,
  inventory: CLINIC,
  formulary: CLINIC,
  visits: CLINIC,
  documents: CLINIC,

  // Creating, editing and deleting a log entry — and evaluating or confirming
  // one — belongs to the nurse and the assistant. Staff get a narrow exception
  // for vital signs; see VITALS_FIELDS below.
  consultations: CLINIC,

  // Recording vital signs writes an activity line, so staff must be able to
  // append here. Nothing reads activities for anything but the dashboard feed.
  activities: ALL,

  // Handing out medicine deducts stock and is the nurse's call. This mirrors
  // the consultation screen, where the dispensing panel is read-only for
  // everyone else.
  prescriptions: ADMIN,

  // Your own profile — name, photo, contact details. Everyone has one, and the
  // route resolves the account from the session, so "any role may write here"
  // does not mean "any role may write anyone's". Changing somebody *else's*
  // account is /api/accounts, below.
  me: ALL,

  // Clinic-wide feature toggles, and other people's accounts.
  settings: ADMIN,
  accounts: ADMIN,
};

/**
 * The only fields a staff account may change on a consultation.
 *
 * Staff assist at intake: they take the assessment and the vital signs of
 * whoever is being checked up. They do not set the purpose of the visit, write
 * the management note, or confirm the log. Restricting the route to PUT is not
 * enough on its own — without this, "record vital signs" would also be a way to
 * rewrite the chief complaint or mark a log confirmed.
 */
const VITALS_FIELDS = new Set([
  'bloodType', 'bp', 'rr', 'pr', 'temp', 'o2sat', 'assessment',
  'recordedBy', 'recordedAt',
]);

/** Reached before anyone can hold a token — auth.js lets these through too. */
const PUBLIC_PATHS = new Set(['/api/login']);

/**
 * Writes any signed-in account may make regardless of role: ending your own
 * session, and changing your own password.
 */
const OPEN_WRITES = new Set(['/api/logout', '/api/change-password']);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** '/api/students/000001' → 'students'. Null when the path is not /api/<resource>. */
function resourceFrom(path) {
  const parts = path.split('/').filter(Boolean); // ['api', 'students', '000001']
  return parts[0] === 'api' && parts[1] ? parts[1] : null;
}

/** Which roles may write this resource. Unknown resources are admin-only. */
function roleFor(resource) {
  return WRITE_ROLES[resource] || ADMIN;
}

/**
 * Is this the one write a staff account is allowed to make — recording the
 * assessment and vital signs on a consultation that already exists?
 *
 * The body is checked field by field rather than trusted because it arrives
 * from the browser: the consultation screen sends only the vitals, but nothing
 * stops a hand-written request from sending `consultStatus` alongside them.
 */
function isVitalsOnlyUpdate(req, fullPath, resource) {
  if (resource !== 'consultations' || req.method !== 'PUT') return false;
  // PUT /api/consultations/:id — an existing entry, not a new one. Mounted
  // under app.use('/api', …), req.path is relative, so the full path is used.
  const parts = fullPath.split('/').filter(Boolean); // ['api', 'consultations', '<id>']
  if (parts.length !== 3) return false;
  const keys = Object.keys(req.body || {});
  return keys.length > 0 && keys.every((key) => VITALS_FIELDS.has(key));
}

/**
 * Refuse writes the signed-in role is not entitled to make.
 *
 * Mounted once, above the routes, for the same reason requireAuth is: a route
 * added below this line is covered by default instead of relying on whoever
 * wrote it to remember. Reads pass straight through.
 */
export function requireWriteAccess() {
  return (req, res, next) => {
    if (READ_METHODS.has(req.method)) { next(); return; }

    // Sub-app paths arrive relative, so rebuild what the client actually asked for.
    const fullPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    if (PUBLIC_PATHS.has(fullPath) || OPEN_WRITES.has(fullPath)) { next(); return; }

    // requireAuth runs first and would have rejected this already; the check is
    // here so that reordering the middleware cannot quietly open a door.
    if (!req.user) { res.status(401).json({ error: 'Sign in to continue' }); return; }

    const resource = resourceFrom(fullPath);
    if (!resource) { res.status(404).json({ error: 'Unknown resource' }); return; }

    if (roleFor(resource).includes(req.user.role)) { next(); return; }
    if (req.user.role === 'staff' && isVitalsOnlyUpdate(req, fullPath, resource)) { next(); return; }

    console.warn(`[auth] refused ${req.method} ${fullPath} for role "${req.user.role}"`);
    res.status(403).json({ error: 'Your account does not have access to this' });
  };
}

export const _internals = { WRITE_ROLES, VITALS_FIELDS, resourceFrom, roleFor, isVitalsOnlyUpdate };
