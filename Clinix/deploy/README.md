# Deploying Clinix to a clinic PC

Goal: the nurse turns the PC on, signs in to Windows, and double-clicks one
icon. No XAMPP Control Panel, no terminal window, nothing else to start.

## One-time setup

On the clinic PC, with XAMPP and Node.js installed and the project copied to
disk, open PowerShell **as Administrator** and run:

```powershell
cd C:\Clinix\Clinix
powershell -ExecutionPolicy Bypass -File deploy\install-clinix.ps1
```

If the nurse signs in with a different Windows account than the one you used to
elevate, name it explicitly:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\install-clinix.ps1 -RunAsUser 'CLINIC-PC\nurse'
```

To undo everything (databases and files are left untouched):

```powershell
powershell -ExecutionPolicy Bypass -File deploy\uninstall-clinix.ps1
```

## What it sets up

| Piece | How it starts | Why |
| --- | --- | --- |
| MySQL | Windows service `ClinixMySQL`, **Automatic** | Runs at boot, before anyone signs in. No XAMPP panel. |
| Clinix server | Scheduled task `Clinix Server`, **at sign-in** | Serves the API *and* the user interface on `http://localhost:4001`. |
| `Clinix` desktop shortcut | — | Opens `http://localhost:4001` in the browser. |

### The MySQL service step is optional

The backend starts MySQL by itself when it is not already running (see
`MYSQL_AUTOSTART` in `backend/.env.example`), so nobody ever has to open the
XAMPP Control Panel — with or without this installer. Running the installer
still helps, because a Windows service starts MySQL at boot rather than when the
backend first needs it, and it shuts the database down cleanly on restart.

The two work together: if MySQL is already up as a service, the backend sees the
port is open and leaves it alone.

If you only want the automatic MySQL start and nothing else, you do not need
this installer at all — just run the backend.

### Why the server runs at sign-in instead of as a service

Document preview converts Word files to PDF. On a PC without LibreOffice this
goes through Microsoft Word, and Word cannot be automated from a background
SYSTEM service — it needs a real signed-in Windows session. Running the server
as the logged-in user keeps that feature working.

If you would rather have the server run at boot without anyone signing in,
install LibreOffice first (`docx2pdf.ps1` prefers it automatically), then the
task can be switched to a SYSTEM service safely.

## After setup

- **Do not press Start next to MySQL in the XAMPP Control Panel any more.**
  MySQL is a service now and starts on its own; a second copy cannot bind port
  3306 and will just report an error.
- Other devices on the same network can reach the system at
  `http://<this-pc-ip>:4001`.

## The encryption key

`backend\.env` holds `DATA_ENC_KEY`, which encrypts the personal and medical
fields in the database. It is not stored in git.

- On a fresh install the script generates a key automatically.
- If the database already contains encrypted data, the script refuses to
  generate a new one and tells you to copy the original key across. A different
  key makes every encrypted record unreadable.
- **Back up `backend\.env` together with the database.** A database backup alone
  cannot be restored without this key.

## Checking on it later

```powershell
Get-Service ClinixMySQL                       # is the database up?
Get-ScheduledTask 'Clinix Server'             # is the server task registered?
Get-ScheduledTaskInfo 'Clinix Server'         # did it last run successfully?
Invoke-WebRequest http://localhost:4001/api/health -UseBasicParsing
```

The server runs with no visible window, so a stray click cannot shut the clinic
system down. Its output goes to `backend\clinix-server.log` instead — read that
file first when something looks wrong.

One trade-off comes with hiding the window: the scheduled task launches the
server and finishes immediately, so Task Scheduler no longer watches the process
and cannot restart it if it crashes. Signing out and back in, or the restart
command below, brings it back.

To restart the server by hand:

```powershell
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName 'Clinix Server'
```

## Medicine suggestions

When a nurse opens a consultation, Clinix suggests what this clinic usually
gives for that complaint. Two sources, in order:

1. **Clinic protocol** — exact entries the nurse recorded ("for Dysmenorrhea we
   give Mefenamic Acid"). Editable in the app.
2. **Usually given here** — a classifier trained on the clinic's own protocol
   and dispensing history. It generalises past exact wording, so "having fever
   since last night" reaches the same answer as "Fever".

Both run on the clinic's own server. Nothing is sent anywhere, there is no
per-request cost, no model to install, and no GPU. Answers are immediate.

**Neither ever supplies a dose.** The dose is the nurse's decision and comes
from her protocol entry, not from any suggestion.

**The classifier stays silent on complaints it has not seen.** That is
deliberate and enforced in code: a medicine sharing no word with the complaint
is excluded no matter how often it is dispensed, so the most common item cannot
win an unfamiliar complaint by frequency alone. Silence is the correct answer
when the system does not know.

It learns as the clinic is used — every dispensing against a complaint becomes
another example. `GET /api/suggest/learned/stats` reports how much it knows.

### Seeding it

A new clinic starts with nothing to learn from. To create a starting protocol
from whatever the clinic stocks:

```powershell
cd backend
node src\seed-formulary.js
```

This writes ~20 **draft** entries for common complaints, drawn only from
in-stock over-the-counter medicines, with no doses. Prescription-only items the
clinic may stock — antibiotics, antihypertensives, salbutamol, steroid drops —
are deliberately excluded: those need a physician's assessment, not a lookup
table. Every row is marked for the nurse to review, correct or delete before
the clinic relies on it.

### Why not a language model

One was built and measured, then removed. A 1B model, given a patient vomiting
blood with rebound tenderness, suggested four medicines including loperamide and
advised no referral. A 3B model got the triage right but returned doses varying
from correct to fourteen times the maximum across identical requests. The
findings are written up in `docs/ai-evaluation.md` — worth reading before anyone
proposes adding one back.

## For a teammate who just pulled the changes

The installer is safe to run again on an existing checkout — it reinstalls
dependencies, rebuilds the interface and restarts the server every time, so a
pull is picked up in full:

```powershell
git pull
powershell -ExecutionPolicy Bypass -File deploy\install-clinix.ps1
```

A teammate does **not** need the installer just to work on the project. Running
`npm start` in `backend` is enough: it starts MySQL by itself and serves the
interface. The installer only adds the boot/logon automation, which matters on
the clinic PC.

Two things do not travel through git, because both are ignored on purpose:

- **`backend\.env`** — the installer recreates it from `.env.example` and
  generates a fresh `DATA_ENC_KEY`. Fine for a teammate with their own empty
  database.
- **`DATA_ENC_KEY` must match the data.** If you ever share a database dump
  between PCs, copy the `DATA_ENC_KEY` line across too. Different key, unreadable
  records. Each developer keeping their own database and their own key is the
  simple path.

Things the installer assumes, which can differ on another PC:

| Assumption | If it differs |
| --- | --- |
| XAMPP at `C:\xampp` | pass `-XamppMysqlBin 'D:\xampp\mysql\bin'` |
| MySQL `root` has no password | set `DB_PASSWORD` in `backend\.env`; the installer's own `mysql -u root` calls would still need editing |
| Node.js on PATH | the script stops with a clear message |
| Port 4001 free | set `PORT` in `backend\.env` |

## Updating the app after a code change

```powershell
git pull
cd frontend; npm run build; cd ..          # rebuild the interface
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName 'Clinix Server'
```
