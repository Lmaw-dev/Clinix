import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ── Start MySQL automatically ────────────────────────────────────────────────
// Running the backend is meant to be the only thing anyone has to do: if MySQL
// is not up yet, this starts it the same way the XAMPP Control Panel would, then
// waits until it accepts connections. The clinic PC never needs XAMPP opened by
// hand, and neither does a developer machine.
//
// Set MYSQL_AUTOSTART=false in .env to turn this off (e.g. when the database
// lives on another computer, or MySQL already runs as a Windows service).
// Set MYSQL_BIN to point at the folder holding mysqld.exe if XAMPP is somewhere
// unusual.

const DEFAULT_BIN_DIRS = [
  'C:\\xampp\\mysql\\bin',
  'D:\\xampp\\mysql\\bin',
  'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin',
  'C:\\Program Files\\MariaDB 11.4\\bin',
];

/** Resolve to true if something is already listening on the database port. */
export function isPortOpen(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function findMysqlBinDir() {
  // An explicitly configured MYSQL_BIN wins outright. Quietly falling back to a
  // different MySQL install than the one that was named would be worse than
  // failing with a clear message.
  const configured = process.env.MYSQL_BIN;
  if (configured) {
    if (fs.existsSync(path.join(configured, 'mysqld.exe'))) return configured;
    console.error(`[mysql] MYSQL_BIN is set to "${configured}" but there is no mysqld.exe there.`);
    return null;
  }
  for (const dir of DEFAULT_BIN_DIRS) {
    if (fs.existsSync(path.join(dir, 'mysqld.exe'))) return dir;
  }
  return null;
}

/**
 * Make sure MySQL is running, starting it if necessary.
 * Returns one of: 'already-running' | 'started' | 'disabled' | 'not-found' |
 * 'timeout' | 'unsupported' | 'failed'.
 */
export async function ensureMysqlRunning() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);

  if (await isPortOpen(host, port)) return 'already-running';

  if (String(process.env.MYSQL_AUTOSTART || '').toLowerCase() === 'false') return 'disabled';
  if (process.platform !== 'win32') return 'unsupported';
  // Only ever start a database that lives on this machine.
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return 'unsupported';

  const binDir = findMysqlBinDir();
  if (!binDir) return 'not-found';

  const mysqld = path.join(binDir, 'mysqld.exe');
  const args = [];
  const iniPath = path.join(binDir, 'my.ini');
  if (fs.existsSync(iniPath)) args.push(`--defaults-file=${iniPath}`);
  args.push('--standalone');

  console.log(`[mysql] Not running — starting ${mysqld}`);
  let exitedEarly = false;
  try {
    // Detached and unref'd so MySQL keeps running independently of this process,
    // exactly like starting it from the XAMPP panel. Killing the API must not
    // take the database down with it.
    const child = spawn(mysqld, args, { detached: true, stdio: 'ignore', windowsHide: true });
    // If mysqld dies immediately (port already taken by another instance, bad
    // config, corrupted data directory) stop waiting instead of sitting out the
    // whole timeout.
    child.once('exit', (code) => {
      if (code !== 0) exitedEarly = true;
    });
    child.once('error', (error) => {
      console.error(`[mysql] Could not launch mysqld: ${error.message}`);
      exitedEarly = true;
    });
    child.unref();
  } catch (error) {
    console.error(`[mysql] Could not launch mysqld: ${error.message}`);
    return 'failed';
  }

  // Starting takes a few seconds, and longer after an unclean shutdown when
  // InnoDB has to recover, so allow a generous window before giving up.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isPortOpen(host, port)) {
      console.log('[mysql] Started and accepting connections.');
      return 'started';
    }
    if (exitedEarly) {
      console.error('[mysql] mysqld exited straight after starting — see the .err file in the MySQL data folder.');
      return 'failed';
    }
  }
  return 'timeout';
}

/** A human-readable hint for the outcomes that need the user to do something. */
export function autostartHint(result) {
  switch (result) {
    case 'not-found':
      return 'Could not find mysqld.exe. Install XAMPP, or set MYSQL_BIN in backend/.env to the folder containing mysqld.exe.';
    case 'timeout':
      return 'MySQL was launched but did not start listening in time. Check C:\\xampp\\mysql\\data for a .err log file.';
    case 'failed':
      return 'MySQL could not be launched. Start it from the XAMPP Control Panel and check the error above.';
    case 'unsupported':
      return 'Automatic start only works for a MySQL running on this Windows PC. Start the database yourself.';
    default:
      return null;
  }
}
