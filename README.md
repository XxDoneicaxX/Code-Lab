# BIT Code Lab

A browser-based Python coding playground for a one-week summer coding camp.
Students on school Chromebooks pick their classroom, enter a 4-digit PIN,
open their capstone group's Codespace, and write Python that runs entirely
in the browser (Pyodide). Code autosaves to the backend database, so nothing
is lost when Chromebooks wipe local files overnight. Teachers create, rename,
and delete capstone groups directly from the classroom dashboard — no group
setup happens ahead of time.

**No accounts.** Access control is one hashed PIN per classroom, which
issues a signed 12-hour session token stored in the browser.

## Quick start

### 1. Backend (FastAPI)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Create the 10 classrooms (no groups — teachers create those) and generate PINs.
# PINs print once and are saved to backend/classroom_pins.txt (gitignored).
python -m app.seed

# Optional: add sample groups to Classroom 1 for local UI testing only.
# python -m app.seed --dev-groups 3

uvicorn app.main:app --port 8000
```

### 2. Frontend (React + Vite)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the
backend on port 8000.

## Teacher notes

- Classroom PINs live in `backend/classroom_pins.txt` after seeding. PINs
  are stored hashed and cannot be recovered — keep that file.
- `python -m app.seed --reset` wipes **everything, including saved student
  projects**, and generates new PINs.
- Classrooms start with **no groups**. After entering the PIN, the teacher
  uses **+ Create Group** on the classroom dashboard to add each capstone
  group by name. Group IDs (not names) are the stable identifier, so
  renaming a group never loses its saved code.
- Each group has exactly one project, created automatically alongside the
  group with a blank starter comment — no quiz/story/calculator templates,
  since the capstone topic isn't chosen yet.
- Deleting a group asks for confirmation and permanently deletes its saved
  project along with it.
- Sessions last 12 hours; students re-enter the PIN the next morning.
- Wrong-PIN attempts are throttled: 8 failures in 5 minutes locks that
  classroom's PIN entry until the window passes.
- Students need internet access to `cdn.jsdelivr.net` (Pyodide + the Monaco
  editor load from there).
- `input()` works and genuinely pauses the program until the student types
  a response — this requires the cross-origin isolation headers described
  under **Deploying for the camp** below. If those headers are missing,
  `input()` fails with a clear message instead of hanging.

## Configuration

Copy `backend/.env.example` to `backend/.env` to override defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | SQLite file in `backend/` | Set to a PostgreSQL URL for production — `psycopg2-binary` is already in `requirements.txt` |
| `SECRET_KEY` | dev value | Signs session tokens — set a long random string in production |
| `TOKEN_TTL_HOURS` | `12` | Classroom session lifetime |
| `CORS_ORIGINS` | localhost:5173 | Comma-separated allowed frontend origins |

## Architecture

```
backend/app/
  main.py         FastAPI app, CORS + isolation headers, table creation,
                   serves frontend/dist in production if it exists
  config.py       Settings (env-overridable)
  database.py     SQLAlchemy engine/session
  models.py       Classroom, Group, Project (one project per group, DB-enforced,
                   cascade-deleted with its group)
  schemas.py      Pydantic request/response models
  security.py     PBKDF2 PIN hashing, HMAC session tokens, PIN throttling
  deps.py         X-Classroom-Token auth dependency
  seed.py         Classroom/PIN seeding script (+ optional dev-only groups)
  routers/        HTTP endpoints (classrooms, groups, projects)
  services/       Business logic (auth, group CRUD, project get-or-create/save)

frontend/src/
  api/client.js          Fetch wrapper + token storage
  hooks/useAutosave.js   5s debounce, stale-response protection, pagehide flush
  hooks/usePythonRunner.js  Pyodide Web Worker driver (run/stop/output/input bridge)
  pages/                 Landing → PIN → classroom dashboard → group Codespace
  components/            TopBar, TileButton, Button, Dialog, GroupNameDialog,
                          ConfirmDialog, OutputConsole, SaveIndicator,
                          ErrorBoundary…
frontend/public/pyodide-worker.js  Python execution in a Web Worker

deploy/
  bit-code-lab.service   systemd unit for the EC2 deployment
  Caddyfile              automatic-HTTPS reverse proxy config
  deploy.sh              pulls latest code, rebuilds, restarts the service
```

Key decisions:

- **Python runs in a Web Worker.** An infinite loop can't freeze the page,
  and the Stop button kills it by terminating the worker. No student code
  ever executes on the server.
- **Autosave is race-safe.** Saves carry a sequence number and an edit
  counter; a slow/stale response can never mark newer edits as "Saved".
  Pending edits also flush (with `fetch` keepalive) when the tab closes.
- **Stateless sessions.** A correct PIN returns an HMAC-signed token with an
  expiry; the backend keeps no session state.
- **Groups are identified by database ID, never by name.** Renaming is a
  pure metadata update — the URL, the project row, and all API calls key off
  `group.id`, so a rename can never orphan or duplicate saved code.
- **`input()` is a genuine synchronous block, not a fake.** The Pyodide
  worker calls `Atomics.wait()` on a `SharedArrayBuffer` and truly pauses
  the Python interpreter until the page writes a response and calls
  `Atomics.notify()`. This needs the page to be cross-origin isolated
  (COOP/COEP headers — see `vite.config.js` and the deploy notes below).

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/classrooms` | — | List classrooms |
| POST | `/api/classrooms/{id}/verify-pin` | — | Exchange PIN for session token |
| GET | `/api/groups` | token | List groups in the caller's classroom |
| POST | `/api/groups` | token | Create a group (+ its blank project) |
| PATCH | `/api/groups/{id}` | token | Rename a group |
| DELETE | `/api/groups/{id}` | token | Delete a group and its project |
| GET | `/api/groups/{id}/project` | token | Load the group's project |
| PUT | `/api/groups/{id}/project` | token | Save project code |

Every `/api/groups...` endpoint resolves the classroom from the session
token and 403s if the requested group belongs to a different classroom, so
a modified group ID in the URL can't cross classroom boundaries.

## Deploying for the camp

**One process runs the whole app.** `npm run build` produces `frontend/dist/`;
if that folder exists, FastAPI serves it directly (static assets + a
client-side-routing fallback to `index.html`) alongside `/api/*` — no nginx,
Caddy config for routing, or separate static host needed for that part. The
isolation headers `input()` needs (`Cross-Origin-Opener-Policy` /
`Cross-Origin-Embedder-Policy`) are set by backend middleware on every
response, so they cover both the API and the static frontend automatically.

Vercel and GitHub Pages won't work here: both only serve static files, and
this app needs a real running FastAPI process plus a persistent database,
neither of which those platforms provide.

### Recommended: a single EC2 instance (cheapest, simplest)

SQLite works fine here — unlike a container platform, a plain EC2 instance
has a real persistent disk, so there's no need for a separately-hosted
database at all. Caddy sits in front only to get free, automatic HTTPS
(required for `input()`); it isn't doing anything the FastAPI app can't
already do for routing.

1. **Launch the instance**: Ubuntu 24.04 LTS, `t3.small`. Security group:
   allow inbound **22** (SSH, restrict to your IP), **80** and **443**
   (Caddy) — deliberately **not** 8000; uvicorn only listens on
   `127.0.0.1` and is never reachable directly from the internet.
2. **(Recommended) Allocate a free Elastic IP** and associate it with the
   instance, so its public address — and therefore your sslip.io hostname,
   if using one — never changes across stops/restarts.
3. **SSH in**, then install dependencies, clone the repo, and build:
   ```bash
   sudo apt-get update && sudo apt-get install -y python3.12-venv nodejs npm git
   git clone <your-repo-url> bit-code-lab && cd bit-code-lab

   cd backend
   python3.12 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   echo "SECRET_KEY=$(python3.12 -c 'import secrets; print(secrets.token_hex(32))')" > .env
   .venv/bin/python -m app.seed --sequential-pins   # PINs saved to classroom_pins.txt
   cd ../frontend && npm ci && npm run build && cd ..
   ```
4. **Install the systemd service** (`deploy/bit-code-lab.service` in this
   repo — edit the paths inside if your clone isn't at
   `/home/ubuntu/bit-code-lab`), so the app survives reboots and restarts
   itself if it ever crashes:
   ```bash
   sudo cp deploy/bit-code-lab.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now bit-code-lab
   ```
5. **Install Caddy** for automatic HTTPS, then use `deploy/Caddyfile` as a
   template — swap in your real domain, or a free
   [sslip.io](https://sslip.io) hostname built from your Elastic IP (e.g.
   `54-12-34-56.sslip.io` for `54.12.34.56`) if you don't have one:
   ```bash
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # after editing the hostname
   sudo systemctl reload caddy
   ```
6. **Get the PINs to the teacher** from `backend/classroom_pins.txt` on the
   instance — gitignored, shown once at seed time, share it outside of git.
7. **Redeploying later**: `bash deploy/deploy.sh` on the instance pulls the
   latest commit, reinstalls dependencies, rebuilds the frontend, and
   restarts the service — one command instead of repeating the steps above.

### Alternative: AWS App Runner + Docker

A repo-root `Dockerfile` also exists (multi-stage: builds the frontend, then
runs the backend serving it) if you'd rather deploy as a container — App
Runner gives you managed HTTPS and scaling at a higher cost and with more
moving parts (a container registry, a separately-hosted database) than the
EC2 path above. Worth it if you want App Runner specifically; overkill for
a one-week camp otherwise.

1. **Provision RDS Postgres first.** App Runner's container filesystem is
   ephemeral — a SQLite file would be wiped on every redeploy or scaling
   event, silently losing every saved project. Postgres here isn't optional
   the way it is on the EC2 path; treat it as required. Note the connection
   string (`postgresql+psycopg2://user:pass@host:5432/dbname`).

2. **Build and push the image to ECR:**
   ```bash
   aws ecr create-repository --repository-name bit-code-lab
   aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   docker build -t bit-code-lab .
   docker tag bit-code-lab:latest <account>.dkr.ecr.<region>.amazonaws.com/bit-code-lab:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/bit-code-lab:latest
   ```

3. **Create the App Runner service** from that ECR image. Set the container
   port to `8000`. Under environment variables, set:
   | Variable | Value |
   | --- | --- |
   | `SECRET_KEY` | a real random string — not the code default |
   | `DATABASE_URL` | the RDS connection string from step 1 |
   | `AUTO_SEED_ON_BOOT` | `true` |
   | `SEED_PIN_MODE` | `sequential` (memorable PINs) or leave unset for random unique ones |

   `AUTO_SEED_ON_BOOT` exists specifically because App Runner gives you no
   shell to run `python -m app.seed` by hand — the app seeds the 10
   classrooms itself on first boot if the database is empty, and prints the
   PINs to stdout instead of a file (there's nowhere to put a file that
   would survive). Find them in **CloudWatch Logs** for the service, right
   after it starts up for the first time. It only seeds once — safe to
   redeploy without re-seeding or duplicating classrooms.

4. **HTTPS is automatic.** App Runner's default `*.awsapprunner.com` domain
   is served over HTTPS out of the box — this matters because `input()`
   needs a secure context (`crossOriginIsolated`), which browsers only grant
   over HTTPS or on `localhost`. If you attach a custom domain later, App
   Runner provisions and renews that certificate too.

**A note on verification:** I wrote and reviewed this Dockerfile carefully,
and confirmed `npm ci` (the exact install step it runs) succeeds against
this repo's lockfile — but I don't have Docker available in my own
environment, so I have not run an actual `docker build` end to end. Run one
locally before you push to ECR:
```bash
docker build -t bit-code-lab .
docker run -p 8000:8000 -e DATABASE_URL=<a-test-postgres-url> -e AUTO_SEED_ON_BOOT=true bit-code-lab
```
Then open `http://localhost:8000` and confirm the app loads and `input()`
works (it will — `localhost` counts as secure even over plain HTTP).

## Out of scope (deliberately)

User accounts, teacher dashboards, version history, multiple files,
real-time collaboration, analytics, starter project templates, and the Bit
AI tutor (planned as a later integration) are all intentionally not built.
