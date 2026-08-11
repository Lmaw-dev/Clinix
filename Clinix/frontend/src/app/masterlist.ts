// ── CSV reading, and the registrar masterlist in particular ──────────────────
// The low-level cell/header helpers are shared with the Students module's own
// CSV import so both read a file the same way. On top of them sits the
// masterlist reader, which pulls out only the five enrolment columns the
// registrar's file is authoritative for.

/** Split one CSV line, honouring quoted cells and "" as an escaped quote. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; } else { quoted = !quoted; }
      continue;
    }
    if (ch === ',' && !quoted) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/** 'Year Level' / 'year_level' / 'YEARLEVEL' all collapse to 'yearlevel'. */
export function normalizeCsvHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export type MasterlistRow = {
  studentId: string;
  name: string;
  lastName: string;
  firstName: string;
  middleName: string;
  course: string;
  yearLevel: string;
  status: string;
  gender: string;
};

// Every registrar exports under slightly different headings, and the file is not
// something the clinic can ask to have reformatted. Recognising the common
// spellings here is cheaper than a column-mapping screen nobody wants to fill in
// twice a year.
const MASTERLIST_HEADERS: Record<string, keyof MasterlistRow> = {
  studentid: 'studentId', id: 'studentId', idnumber: 'studentId', idno: 'studentId',
  studentno: 'studentId', studentnumber: 'studentId',
  name: 'name', fullname: 'name', studentname: 'name',
  lastname: 'lastName', surname: 'lastName', familyname: 'lastName',
  firstname: 'firstName', givenname: 'firstName',
  middlename: 'middleName', middleinitial: 'middleName', mi: 'middleName',
  course: 'course', program: 'course', coursecode: 'course', degree: 'course',
  yearlevel: 'yearLevel', year: 'yearLevel', level: 'yearLevel', yr: 'yearLevel',
  status: 'status', enrollmentstatus: 'status', enrolmentstatus: 'status', studentstatus: 'status',
  gender: 'gender', sex: 'gender',
};

const EMPTY: MasterlistRow = {
  studentId: '', name: '', lastName: '', firstName: '', middleName: '',
  course: '', yearLevel: '', status: '', gender: '',
};

export type MasterlistFile = {
  rows: MasterlistRow[];
  /** Headings in the file that map to nothing — shown so a typo is visible. */
  ignoredColumns: string[];
  /** Enrolment columns the file never had. A missing 'yearLevel' is fatal. */
  missingColumns: string[];
};

/**
 * Read a registrar CSV export into masterlist rows.
 *
 * Rows with nothing in them at all are dropped (trailing blank lines are normal
 * in an Excel "Save as CSV"); anything else is kept even when it looks wrong, so
 * the server can report it back as a numbered line the encoder can go and fix.
 */
export function parseMasterlistCsv(text: string): MasterlistFile {
  const lines = text.replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return { rows: [], ignoredColumns: [], missingColumns: ['studentId', 'course', 'yearLevel'] };

  const headers = parseCsvLine(lines.shift()!).map(normalizeCsvHeader);
  const mapped = headers.map((h) => MASTERLIST_HEADERS[h]);
  const ignoredColumns = headers.filter((h, i) => h && !mapped[i]);
  const present = new Set(mapped.filter(Boolean));
  const missingColumns = (['studentId', 'course', 'yearLevel'] as const).filter((k) => !present.has(k));

  const rows = lines.flatMap((line) => {
    const cells = parseCsvLine(line);
    if (!cells.some((c) => c)) return [];
    const row = { ...EMPTY };
    mapped.forEach((key, i) => { if (key) row[key] = cells[i] ?? ''; });
    return [row];
  });

  return { rows, ignoredColumns, missingColumns };
}
